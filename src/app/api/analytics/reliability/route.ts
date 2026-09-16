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

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

interface OptionRow extends RowDataPacket {
  value: string;
}

interface AggregateRow extends RowDataPacket {
  label: string;
  occurrences:
    | number
    | string;
  downtime_minutes:
    | number
    | string
    | null;
}

interface ParetoItem {
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  percentage: number;
  cumulativePercentage: number;
}

interface JackKnifeItem {
  label: string;
  failures: number;
  downtimeMinutes: number;
  mttr: number;
  quadrant:
    | "CRITICO"
    | "CRITICO_CRONICO"
    | "CONFORTO"
    | "CRONICO";
}

/* =========================================================
   HELPERS
========================================================= */

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function round(
  value: number,
  digits = 2,
): number {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value *
        factor,
    ) /
    factor
  );
}

function isDateValue(
  value: string | null,
): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      ),
  );
}

function buildDateWhere(
  startDate:
    | string
    | null,
  endDate:
    | string
    | null,
  params: Array<
    string | number
  >,
): string[] {
  const where: string[] =
    [];

  if (
    isDateValue(
      startDate,
    )
  ) {
    where.push(
      "e.event_date >= ?",
    );

    params.push(
      startDate,
    );
  }

  if (
    isDateValue(
      endDate,
    )
  ) {
    where.push(
      "e.event_date <= ?",
    );

    params.push(
      endDate,
    );
  }

  return where;
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
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

    /* =====================================================
       OPÇÕES DE LINHA
       - respeitam unidade e período
    ====================================================== */

    const lineParams:
      Array<
        string | number
      > = [
        session.unitId,
      ];

    const lineWhere =
      [
        "e.unit_id = ?",
        "e.source_line_name IS NOT NULL",
        "TRIM(e.source_line_name) <> ''",
        ...buildDateWhere(
          startDate,
          endDate,
          lineParams,
        ),
      ];

    const lines =
      await executeRows<
        OptionRow[]
      >(
        `
          SELECT DISTINCT
            TRIM(
              e.source_line_name
            ) AS value
          FROM maintenance_events e
          WHERE ${lineWhere.join(
            "\nAND ",
          )}
          ORDER BY value ASC
        `,
        lineParams,
      );

    /* =====================================================
       OPÇÕES DE EQUIPAMENTO
       - respeitam unidade, período e linha
    ====================================================== */

    const equipmentParams:
      Array<
        string | number
      > = [
        session.unitId,
      ];

    const equipmentWhere =
      [
        "e.unit_id = ?",
        "e.source_equipment_name IS NOT NULL",
        "TRIM(e.source_equipment_name) <> ''",
        ...buildDateWhere(
          startDate,
          endDate,
          equipmentParams,
        ),
      ];

    if (line) {
      equipmentWhere.push(
        "TRIM(e.source_line_name) = ?",
      );

      equipmentParams.push(
        line,
      );
    }

    const equipments =
      await executeRows<
        OptionRow[]
      >(
        `
          SELECT DISTINCT
            TRIM(
              e.source_equipment_name
            ) AS value
          FROM maintenance_events e
          WHERE ${equipmentWhere.join(
            "\nAND ",
          )}
          ORDER BY value ASC
        `,
        equipmentParams,
      );

    /* =====================================================
       CONSULTA ANALÍTICA
    ====================================================== */

    const params:
      Array<
        string | number
      > = [
        session.unitId,
      ];

    const where =
      [
        "e.unit_id = ?",
        ...buildDateWhere(
          startDate,
          endDate,
          params,
        ),
      ];

    if (line) {
      where.push(
        "TRIM(e.source_line_name) = ?",
      );

      params.push(
        line,
      );
    }

    if (equipment) {
      where.push(
        "TRIM(e.source_equipment_name) = ?",
      );

      params.push(
        equipment,
      );
    }

    /*
      A classificação oficial em event_classifications
      sempre tem prioridade.

      classification_suggestions existe apenas como fallback
      para preservar as classificações históricas já geradas
      antes da retirada da tela do Modelo ML.
    */

    const failureModeExpression =
      `
        COALESCE(
          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.failureMode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),

          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.failure_mode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),

          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.modelSuggestion.failureMode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),

          NULLIF(
            cs.failure_mode,
            ''
          ),

          'Não classificado'
        )
      `;

    const groupExpression =
      equipment
        ? "base.failure_mode"
        : `
            COALESCE(
              NULLIF(
                TRIM(
                  base.equipment
                ),
                ''
              ),
              'Equipamento não informado'
            )
          `;

    const aggregates =
      await executeRows<
        AggregateRow[]
      >(
        `
          WITH latest_suggestion AS (
            SELECT
              cs0.event_id,
              MAX(
                cs0.id
              ) AS suggestion_id
            FROM classification_suggestions cs0
            WHERE cs0.model_type = 'ML'
            GROUP BY
              cs0.event_id
          ),

          base AS (
            SELECT
              e.id,

              e.source_equipment_name
                AS equipment,

              e.downtime_minutes,

              ${failureModeExpression}
                AS failure_mode

            FROM maintenance_events e

            LEFT JOIN event_classifications ec
              ON ec.event_id =
                 e.id

            LEFT JOIN latest_suggestion latest
              ON latest.event_id =
                 e.id

            LEFT JOIN classification_suggestions cs
              ON cs.id =
                 latest.suggestion_id

            WHERE ${where.join(
              "\nAND ",
            )}
          )

          SELECT
            ${groupExpression}
              AS label,

            COUNT(*)
              AS occurrences,

            SUM(
              COALESCE(
                base.downtime_minutes,
                0
              )
            )
              AS downtime_minutes

          FROM base

          GROUP BY
            label

          ORDER BY
            downtime_minutes DESC,
            occurrences DESC,
            label ASC
        `,
        params,
      );

    const normalized =
      aggregates
        .map(
          (
            row,
          ) => {
            const occurrences =
              toNumber(
                row.occurrences,
              );

            const downtimeMinutes =
              toNumber(
                row.downtime_minutes,
              );

            return {
              label:
                row.label,

              occurrences,

              downtimeMinutes,

              mttr:
                occurrences >
                0
                  ? downtimeMinutes /
                    occurrences
                  : 0,
            };
          },
        )
        .filter(
          (
            item,
          ) =>
            item.occurrences >
            0,
        );

    /* =====================================================
       JACK-KNIFE
    ====================================================== */

    const failuresAverage =
      normalized.length >
      0
        ? normalized.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.occurrences,
            0,
          ) /
          normalized.length
        : 0;

    const mttrAverage =
      normalized.length >
      0
        ? normalized.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.mttr,
            0,
          ) /
          normalized.length
        : 0;

    const jackKnife:
      JackKnifeItem[] =
      normalized.map(
        (
          item,
        ) => {
          const highFrequency =
            item.occurrences >=
            failuresAverage;

          const highMttr =
            item.mttr >=
            mttrAverage;

          let quadrant:
            JackKnifeItem["quadrant"] =
            "CONFORTO";

          if (
            highFrequency &&
            highMttr
          ) {
            quadrant =
              "CRITICO_CRONICO";
          } else if (
            !highFrequency &&
            highMttr
          ) {
            quadrant =
              "CRITICO";
          } else if (
            highFrequency &&
            !highMttr
          ) {
            quadrant =
              "CRONICO";
          }

          return {
            label:
              item.label,

            failures:
              item.occurrences,

            downtimeMinutes:
              round(
                item.downtimeMinutes,
              ),

            mttr:
              round(
                item.mttr,
              ),

            quadrant,
          };
        },
      );

    /* =====================================================
       PARETO
       - Top 10 + Outros
    ====================================================== */

    const totalDowntime =
      normalized.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.downtimeMinutes,
        0,
      );

    const sortedPareto =
      [
        ...normalized,
      ].sort(
        (
          a,
          b,
        ) =>
          b.downtimeMinutes -
          a.downtimeMinutes,
      );

    const top =
      sortedPareto.slice(
        0,
        10,
      );

    const rest =
      sortedPareto.slice(
        10,
      );

    if (
      rest.length >
      0
    ) {
      top.push({
        label:
          "Outros",

        occurrences:
          rest.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.occurrences,
            0,
          ),

        downtimeMinutes:
          rest.reduce(
            (
              total,
              item,
            ) =>
              total +
              item.downtimeMinutes,
            0,
          ),

        mttr:
          0,
      });
    }

    let cumulative =
      0;

    const pareto:
      ParetoItem[] =
      top.map(
        (
          item,
        ) => {
          cumulative +=
            item.downtimeMinutes;

          const percentage =
            totalDowntime >
            0
              ? (
                  item.downtimeMinutes /
                  totalDowntime
                ) *
                100
              : 0;

          const cumulativePercentage =
            totalDowntime >
            0
              ? (
                  cumulative /
                  totalDowntime
                ) *
                100
              : 0;

          return {
            label:
              item.label,

            occurrences:
              item.occurrences,

            downtimeMinutes:
              round(
                item.downtimeMinutes,
              ),

            percentage:
              round(
                percentage,
              ),

            cumulativePercentage:
              round(
                cumulativePercentage,
              ),
          };
        },
      );

    const totalEvents =
      normalized.reduce(
        (
          total,
          item,
        ) =>
          total +
          item.occurrences,
        0,
      );

    return NextResponse.json({
      success:
        true,

      analysisLevel:
        equipment
          ? "FAILURE_MODE"
          : "EQUIPMENT",

      filters: {
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

        options: {
          lines:
            lines.map(
              (
                item,
              ) =>
                item.value,
            ),

          equipments:
            equipments.map(
              (
                item,
              ) =>
                item.value,
            ),
        },
      },

      summary: {
        events:
          totalEvents,

        downtimeMinutes:
          round(
            totalDowntime,
          ),

        groups:
          normalized.length,
      },

      pareto,

      jackKnife,

      jackKnifeLimits: {
        failures:
          round(
            failuresAverage,
          ),

        mttr:
          round(
            mttrAverage,
          ),
      },
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        message:
          "Não foi possível carregar os dados de confiabilidade.",
      },
      {
        status:
          500,
      },
    );
  }
}
