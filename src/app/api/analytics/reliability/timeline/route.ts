import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

type TimelineGrouping =
  | "DAY"
  | "WEEK"
  | "MONTH";

interface TimelineRow
  extends RowDataPacket {
  period_start:
    | string
    | Date;

  events:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}

interface TimelineSummaryRow
  extends RowDataPacket {
  events:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}

interface TimelineItem {
  periodStart:
    string;

  label:
    string;

  events:
    number;

  downtimeMinutes:
    number;

  mttr:
    number;
}

interface TimelineSummary {
  events:
    number;

  downtimeMinutes:
    number;

  mttr:
    number;
}

interface TimelineComparison {
  previousStartDate:
    string;

  previousEndDate:
    string;

  current:
    TimelineSummary;

  previous:
    TimelineSummary;

  variation: {
    eventsPercentage:
      number | null;

    downtimePercentage:
      number | null;

    mttrPercentage:
      number | null;
  };
}

/* =========================================================
   HELPERS
========================================================= */

function isDateValue(
  value:
    | string
    | null,
): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      ),
  );
}

function parseDateOnly(
  value:
    string,
): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return null;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] =
    value.split(
      "-",
    );

  const year =
    Number(
      yearText,
    );

  const month =
    Number(
      monthText,
    );

  const day =
    Number(
      dayText,
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    return null;
  }

  return date;
}

function formatDateOnly(
  date:
    Date,
): string {
  const year =
    date.getUTCFullYear();

  const month =
    String(
      date.getUTCMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function normalizeDatabaseDate(
  value:
    | string
    | Date,
): string {
  if (
    value instanceof
    Date
  ) {
    return formatDateOnly(
      new Date(
        Date.UTC(
          value.getFullYear(),
          value.getMonth(),
          value.getDate(),
        ),
      ),
    );
  }

  const text =
    String(
      value,
    );

  return text.slice(
    0,
    10,
  );
}

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  const parsed =
    Number(
      value ??
        0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function round(
  value:
    number,
  decimals =
    2,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  const factor =
    10 **
    decimals;

  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

function addUtcDays(
  date:
    Date,
  days:
    number,
): Date {
  const result =
    new Date(
      date.getTime(),
    );

  result.setUTCDate(
    result.getUTCDate() +
      days,
  );

  return result;
}

function daysBetweenInclusive(
  start:
    Date,
  end:
    Date,
): number {
  const difference =
    end.getTime() -
    start.getTime();

  return (
    Math.floor(
      difference /
        86400000,
    ) +
    1
  );
}

function percentageVariation(
  current:
    number,
  previous:
    number,
): number | null {
  if (
    previous ===
    0
  ) {
    if (
      current ===
      0
    ) {
      return 0;
    }

    return null;
  }

  return round(
    (
      (
        current -
        previous
      ) /
      previous
    ) *
      100,
    2,
  );
}

function startOfWeek(
  date:
    Date,
): Date {
  const result =
    new Date(
      date.getTime(),
    );

  /*
   * JS:
   * 0 = domingo
   * 1 = segunda
   *
   * Nossa semana analítica começa na segunda-feira.
   */

  const day =
    result.getUTCDay();

  const daysSinceMonday =
    (
      day +
      6
    ) %
    7;

  result.setUTCDate(
    result.getUTCDate() -
      daysSinceMonday,
  );

  return result;
}

function startOfMonth(
  date:
    Date,
): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1,
    ),
  );
}

function alignPeriodStart(
  date:
    Date,
  grouping:
    TimelineGrouping,
): Date {
  if (
    grouping ===
    "WEEK"
  ) {
    return startOfWeek(
      date,
    );
  }

  if (
    grouping ===
    "MONTH"
  ) {
    return startOfMonth(
      date,
    );
  }

  return new Date(
    date.getTime(),
  );
}

function incrementPeriod(
  date:
    Date,
  grouping:
    TimelineGrouping,
): Date {
  const next =
    new Date(
      date.getTime(),
    );

  if (
    grouping ===
    "DAY"
  ) {
    next.setUTCDate(
      next.getUTCDate() +
        1,
    );

    return next;
  }

  if (
    grouping ===
    "WEEK"
  ) {
    next.setUTCDate(
      next.getUTCDate() +
        7,
    );

    return next;
  }

  next.setUTCMonth(
    next.getUTCMonth() +
      1,
  );

  return next;
}

function buildPeriodLabel(
  periodStart:
    string,
  grouping:
    TimelineGrouping,
): string {
  const date =
    parseDateOnly(
      periodStart,
    );

  if (
    !date
  ) {
    return periodStart;
  }

  const day =
    String(
      date.getUTCDate(),
    ).padStart(
      2,
      "0",
    );

  const month =
    String(
      date.getUTCMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  if (
    grouping ===
    "DAY"
  ) {
    return `${day}/${month}`;
  }

  if (
    grouping ===
    "WEEK"
  ) {
    return `Sem. ${day}/${month}`;
  }

  const monthNames = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];

  const year =
    String(
      date.getUTCFullYear(),
    ).slice(
      -2,
    );

  return `${
    monthNames[
      date.getUTCMonth()
    ]
  }/${year}`;
}

function createSummary(
  events:
    number,
  downtimeMinutes:
    number,
): TimelineSummary {
  const safeEvents =
    Math.max(
      0,
      events,
    );

  const safeDowntime =
    Math.max(
      0,
      downtimeMinutes,
    );

  const mttr =
    safeEvents >
    0
      ? safeDowntime /
        safeEvents
      : 0;

  return {
    events:
      safeEvents,

    downtimeMinutes:
      round(
        safeDowntime,
      ),

    mttr:
      round(
        mttr,
      ),
  };
}

/* =========================================================
   PREENCHIMENTO DE LACUNAS

   Exemplo:

   Se existem falhas em:
   01/10
   03/10

   precisamos retornar:

   01/10 -> valores
   02/10 -> zero
   03/10 -> valores

   Caso contrário, o gráfico esconderia visualmente o dia
   sem ocorrências.
========================================================= */

function buildContinuousTimeline({
  rows,
  startDate,
  endDate,
  grouping,
}: {
  rows:
    TimelineRow[];

  startDate:
    string | null;

  endDate:
    string | null;

  grouping:
    TimelineGrouping;
}): TimelineItem[] {
  const rowMap =
    new Map<
      string,
      {
        events: number;
        downtimeMinutes: number;
      }
    >();

  for (
    const row
    of rows
  ) {
    const periodStart =
      normalizeDatabaseDate(
        row.period_start,
      );

    rowMap.set(
      periodStart,
      {
        events:
          toNumber(
            row.events,
          ),

        downtimeMinutes:
          toNumber(
            row.downtime_minutes,
          ),
      },
    );
  }

  /*
   * Se não temos intervalo completo válido,
   * usamos apenas os períodos retornados pelo banco.
   */

  if (
    !startDate ||
    !endDate
  ) {
    return [
      ...rowMap.entries(),
    ]
      .sort(
        (
          a,
          b,
        ) =>
          a[0].localeCompare(
            b[0],
          ),
      )
      .map(
        ([
          periodStart,
          values,
        ]) => {
          const mttr =
            values.events >
            0
              ? values
                  .downtimeMinutes /
                values.events
              : 0;

          return {
            periodStart,

            label:
              buildPeriodLabel(
                periodStart,
                grouping,
              ),

            events:
              values.events,

            downtimeMinutes:
              round(
                values
                  .downtimeMinutes,
              ),

            mttr:
              round(
                mttr,
              ),
          };
        },
      );
  }

  const parsedStart =
    parseDateOnly(
      startDate,
    );

  const parsedEnd =
    parseDateOnly(
      endDate,
    );

  if (
    !parsedStart ||
    !parsedEnd
  ) {
    return [];
  }

  let current =
    alignPeriodStart(
      parsedStart,
      grouping,
    );

  const last =
    alignPeriodStart(
      parsedEnd,
      grouping,
    );

  const result:
    TimelineItem[] = [];

  /*
   * Proteção adicional contra ranges absurdamente grandes.
   *
   * 5000 pontos diários já representa mais de 13 anos.
   */

  let safety =
    0;

  while (
    current.getTime() <=
      last.getTime() &&
    safety <
      5000
  ) {
    const periodStart =
      formatDateOnly(
        current,
      );

    const values =
      rowMap.get(
        periodStart,
      ) ?? {
        events:
          0,

        downtimeMinutes:
          0,
      };

    const mttr =
      values.events >
      0
        ? values
            .downtimeMinutes /
          values.events
        : 0;

    result.push({
      periodStart,

      label:
        buildPeriodLabel(
          periodStart,
          grouping,
        ),

      events:
        values.events,

      downtimeMinutes:
        round(
          values
            .downtimeMinutes,
        ),

      mttr:
        round(
          mttr,
        ),
    });

    current =
      incrementPeriod(
        current,
        grouping,
      );

    safety +=
      1;
  }

  return result;
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await getSession();

  if (
    !session
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Sessão expirada.",
      },
      {
        status:
          401,
      },
    );
  }

  try {
    /* =====================================================
       UNIDADES
    ====================================================== */

    const unitSelection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });

    if (
      unitSelection
        .selectedUnitIds
        .length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Nenhuma unidade válida está selecionada.",
        },
        {
          status:
            403,
        },
      );
    }

    const unitFilter =
      buildUnitInClause(
        unitSelection
          .selectedUnitIds,
      );

    /* =====================================================
       PARÂMETROS
    ====================================================== */

    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const startDate =
      searchParams.get(
        "startDate",
      );

    const endDate =
      searchParams.get(
        "endDate",
      );

    const line =
      searchParams
        .get(
          "line",
        )
        ?.trim() ||
      "";

    const equipment =
      searchParams
        .get(
          "equipment",
        )
        ?.trim() ||
      "";

    const groupingRaw =
      searchParams
        .get(
          "groupBy",
        )
        ?.trim()
        .toUpperCase() ||
      "DAY";

    const grouping:
      TimelineGrouping =
      groupingRaw ===
        "WEEK"
        ? "WEEK"
        : groupingRaw ===
            "MONTH"
          ? "MONTH"
          : "DAY";

    /* =====================================================
       VALIDAÇÃO DO PERÍODO
    ====================================================== */

    if (
      startDate &&
      !isDateValue(
        startDate,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Data inicial inválida.",
        },
        {
          status:
            400,
        },
      );
    }

    if (
      endDate &&
      !isDateValue(
        endDate,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Data final inválida.",
        },
        {
          status:
            400,
        },
      );
    }

    let parsedStart:
      Date | null =
      null;

    let parsedEnd:
      Date | null =
      null;

    if (
      startDate &&
      endDate
    ) {
      parsedStart =
        parseDateOnly(
          startDate,
        );

      parsedEnd =
        parseDateOnly(
          endDate,
        );

      if (
        !parsedStart ||
        !parsedEnd ||
        parsedStart.getTime() >
          parsedEnd.getTime()
      ) {
        return NextResponse.json(
          {
            success:
              false,

            message:
              "O período informado é inválido.",
          },
          {
            status:
              400,
          },
        );
      }
    }

    /* =====================================================
       WHERE DO PERÍODO ATUAL

       Mesma seleção global utilizada pela página:

       - unidade
       - período
       - linha
       - equipamento
    ====================================================== */

    const where:
      string[] = [
        `e.unit_id IN (${unitFilter.placeholders})`,

        "e.event_date IS NOT NULL",
      ];

    const values:
      Array<
        string | number
      > = [
        ...unitFilter.values,
      ];

    if (
      startDate
    ) {
      where.push(
        "e.event_date >= ?",
      );

      values.push(
        startDate,
      );
    }

    if (
      endDate
    ) {
      where.push(
        "e.event_date <= ?",
      );

      values.push(
        endDate,
      );
    }

    if (
      line
    ) {
      where.push(
        "TRIM(e.source_line_name) = ?",
      );

      values.push(
        line,
      );
    }

    if (
      equipment
    ) {
      where.push(
        "TRIM(e.source_equipment_name) = ?",
      );

      values.push(
        equipment,
      );
    }

    /* =====================================================
       EXPRESSÃO DO AGRUPAMENTO
    ====================================================== */

    const periodExpression =
      grouping ===
      "WEEK"
        ? `
            DATE_SUB(
              DATE(
                e.event_date
              ),
              INTERVAL WEEKDAY(
                e.event_date
              ) DAY
            )
          `
        : grouping ===
            "MONTH"
          ? `
              DATE_FORMAT(
                e.event_date,
                '%Y-%m-01'
              )
            `
          : `
              DATE(
                e.event_date
              )
            `;

    /* =====================================================
       CONSULTA DA SÉRIE ATUAL
    ====================================================== */

    const rows =
      await executeRows<
        TimelineRow[]
      >(
        `
          SELECT
            ${periodExpression}
              AS period_start,

            COUNT(*)
              AS events,

            COALESCE(
              SUM(
                COALESCE(
                  e.downtime_minutes,
                  0
                )
              ),
              0
            )
              AS downtime_minutes

          FROM
            maintenance_events e

          WHERE
            ${where.join(
              "\nAND ",
            )}

          GROUP BY
            period_start

          ORDER BY
            period_start ASC
        `,
        values,
      );

    /* =====================================================
       SÉRIE CONTÍNUA
    ====================================================== */

    const timeline =
      buildContinuousTimeline({
        rows,

        startDate:
          startDate ??
          null,

        endDate:
          endDate ??
          null,

        grouping,
      });

    /* =====================================================
       RESUMO DO PERÍODO ATUAL
    ====================================================== */

    const totalEvents =
      timeline.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.events,
        0,
      );

    const totalDowntimeMinutes =
      timeline.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.downtimeMinutes,
        0,
      );

    const currentSummary =
      createSummary(
        totalEvents,
        totalDowntimeMinutes,
      );

    /* =====================================================
       PERÍODO ANTERIOR

       Exemplo:

       atual:
       01/09 até 30/09

       anterior:
       02/08 até 31/08

       Ambos possuem a mesma quantidade de dias.
    ====================================================== */

    let comparison:
      TimelineComparison | null =
      null;

    if (
      parsedStart &&
      parsedEnd
    ) {
      const durationDays =
        daysBetweenInclusive(
          parsedStart,
          parsedEnd,
        );

      const previousEnd =
        addUtcDays(
          parsedStart,
          -1,
        );

      const previousStart =
        addUtcDays(
          previousEnd,
          -(
            durationDays -
            1
          ),
        );

      const previousStartDate =
        formatDateOnly(
          previousStart,
        );

      const previousEndDate =
        formatDateOnly(
          previousEnd,
        );

      /* ===================================================
         WHERE DO PERÍODO ANTERIOR

         Unidade, linha e equipamento permanecem iguais.

         Apenas o período muda.
      ==================================================== */

      const previousWhere:
        string[] = [
          `e.unit_id IN (${unitFilter.placeholders})`,

          "e.event_date IS NOT NULL",

          "e.event_date >= ?",

          "e.event_date <= ?",
        ];

      const previousValues:
        Array<
          string | number
        > = [
          ...unitFilter.values,

          previousStartDate,

          previousEndDate,
        ];

      if (
        line
      ) {
        previousWhere.push(
          "TRIM(e.source_line_name) = ?",
        );

        previousValues.push(
          line,
        );
      }

      if (
        equipment
      ) {
        previousWhere.push(
          "TRIM(e.source_equipment_name) = ?",
        );

        previousValues.push(
          equipment,
        );
      }

      /* ===================================================
         RESUMO DO PERÍODO ANTERIOR

         Não precisamos gerar todos os pontos da timeline.
         Para comparação bastam os agregados.
      ==================================================== */

      const previousRows =
        await executeRows<
          TimelineSummaryRow[]
        >(
          `
            SELECT
              COUNT(*)
                AS events,

              COALESCE(
                SUM(
                  COALESCE(
                    e.downtime_minutes,
                    0
                  )
                ),
                0
              )
                AS downtime_minutes

            FROM
              maintenance_events e

            WHERE
              ${previousWhere.join(
                "\nAND ",
              )}
          `,
          previousValues,
        );

      const previousEvents =
        toNumber(
          previousRows[
            0
          ]?.events,
        );

      const previousDowntimeMinutes =
        toNumber(
          previousRows[
            0
          ]?.downtime_minutes,
        );

      const previousSummary =
        createSummary(
          previousEvents,
          previousDowntimeMinutes,
        );

      comparison = {
        previousStartDate,

        previousEndDate,

        current:
          currentSummary,

        previous:
          previousSummary,

        variation: {
          eventsPercentage:
            percentageVariation(
              currentSummary.events,
              previousSummary.events,
            ),

          downtimePercentage:
            percentageVariation(
              currentSummary.downtimeMinutes,
              previousSummary.downtimeMinutes,
            ),

          mttrPercentage:
            percentageVariation(
              currentSummary.mttr,
              previousSummary.mttr,
            ),
        },
      };
    }

    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

      groupBy:
        grouping,

      filters: {
        selectedUnitIds:
          unitSelection
            .selectedUnitIds,

        startDate:
          startDate ??
          null,

        endDate:
          endDate ??
          null,

        line:
          line ||
          null,

        equipment:
          equipment ||
          null,
      },

      summary:
        currentSummary,

      comparison,

      items:
        timeline,
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability/timeline",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar a evolução temporal das falhas.",
      },
      {
        status:
          500,
      },
    );
  }
}