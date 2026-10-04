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


interface SummaryRow
  extends RowDataPacket {
  occurrences:
    | number
    | string
    | null;

  downtime_minutes:
    | number
    | string
    | null;

  classified_occurrences:
    | number
    | string
    | null;

  first_event_date:
    | string
    | Date
    | null;

  last_event_date:
    | string
    | Date
    | null;
}


interface FailureRow
  extends RowDataPacket {
  failure_mode:
    string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface ProductRow
  extends RowDataPacket {
  material_code:
    | string
    | null;

  material_description:
    | string
    | null;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface FailureProductRow
  extends RowDataPacket {
  failure_mode:
    string;

  material_code:
    | string
    | null;

  material_description:
    | string
    | null;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface OriginRow
  extends RowDataPacket {
  origin:
    string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface TimelineRow
  extends RowDataPacket {
  period_start:
    | string
    | Date;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface LineRow
  extends RowDataPacket {
  line:
    string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
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
    Number(
      value ?? 0,
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
  digits =
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
    digits;


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


function isDateValue(
  value:
    string | null,
): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      ),
  );
}


function cleanText(
  value:
    string | null,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }


  const result =
    value.trim();


  return result ||
    null;
}


function formatDatabaseDate(
  value:
    | string
    | Date
    | null,
): string | null {
  if (
    !value
  ) {
    return null;
  }


  if (
    value instanceof
    Date
  ) {
    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() +
          1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        value.getDate(),
      ).padStart(
        2,
        "0",
      );


    return `${year}-${month}-${day}`;
  }


  return String(
    value,
  ).slice(
    0,
    10,
  );
}


function buildProductLabel(
  code:
    string | null,
  description:
    string | null,
): string {
  if (
    description &&
    code
  ) {
    return `${description} · ${code}`;
  }


  if (
    description
  ) {
    return description;
  }


  if (
    code
  ) {
    return code;
  }


  return "Produto não informado";
}


function normalizeGrouping(
  value:
    string | null,
): TimelineGrouping {
  const normalized =
    value
      ?.trim()
      .toUpperCase();


  if (
    normalized ===
    "WEEK"
  ) {
    return "WEEK";
  }


  if (
    normalized ===
    "MONTH"
  ) {
    return "MONTH";
  }


  return "DAY";
}


function buildPeriodExpression(
  grouping:
    TimelineGrouping,
): string {
  if (
    grouping ===
    "WEEK"
  ) {
    return `
      DATE_SUB(
        DATE(
          e.event_date
        ),
        INTERVAL WEEKDAY(
          e.event_date
        ) DAY
      )
    `;
  }


  if (
    grouping ===
    "MONTH"
  ) {
    return `
      DATE_FORMAT(
        e.event_date,
        '%Y-%m-01'
      )
    `;
  }


  return `
    DATE(
      e.event_date
    )
  `;
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


    const equipment =
      searchParams
        .get(
          "equipment",
        )
        ?.trim() ||
      "";


    const line =
      searchParams
        .get(
          "line",
        )
        ?.trim() ||
      "";


    const startDate =
      searchParams.get(
        "startDate",
      );


    const endDate =
      searchParams.get(
        "endDate",
      );


    const grouping =
      normalizeGrouping(
        searchParams.get(
          "groupBy",
        ),
      );


    if (
      !equipment
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Informe o equipamento para gerar o DNA.",
        },
        {
          status:
            400,
        },
      );
    }


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


    /* =====================================================
       WHERE
    ====================================================== */

    const params:
      Array<
        string | number
      > = [
        ...unitFilter.values,

        equipment,
      ];


    const where:
      string[] = [
        `e.unit_id IN (${unitFilter.placeholders})`,

        "TRIM(e.source_equipment_name) = ?",
      ];


    if (
      startDate
    ) {
      where.push(
        "e.event_date >= ?",
      );

      params.push(
        startDate,
      );
    }


    if (
      endDate
    ) {
      where.push(
        "e.event_date <= ?",
      );

      params.push(
        endDate,
      );
    }


    if (
      line
    ) {
      where.push(
        "TRIM(e.source_line_name) = ?",
      );

      params.push(
        line,
      );
    }


    /* =====================================================
       MODO DE FALHA EFETIVO
    ====================================================== */

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
            TRIM(
              cs.failure_mode
            ),
            ''
          ),

          'Não classificado'
        )
      `;


    /* =====================================================
       ORIGEM EFETIVA

       Manual > ML > não classificado.
    ====================================================== */

    const originExpression =
      `
        CASE
          WHEN UPPER(
            TRIM(
              COALESCE(
                origin_review.manual_origin,
                origin_prediction.failure_origin,
                ''
              )
            )
          ) = 'OPERACAO'
            THEN 'OPERACAO'

          WHEN UPPER(
            TRIM(
              COALESCE(
                origin_review.manual_origin,
                origin_prediction.failure_origin,
                ''
              )
            )
          ) = 'MANUTENCAO'
            THEN 'MANUTENCAO'

          ELSE 'NAO_CLASSIFICADO'
        END
      `;


    /* =====================================================
       CTE BASE
    ====================================================== */

    const baseCte =
      `
        WITH latest_suggestion AS (
          SELECT
            cs0.event_id,

            MAX(
              cs0.id
            ) AS suggestion_id

          FROM
            classification_suggestions cs0

          WHERE
            cs0.model_type =
              'ML'

          GROUP BY
            cs0.event_id
        ),

        base AS (
          SELECT
            e.id,

            e.event_date,

            e.source_line_name
              AS line,

            e.source_material_code
              AS material_code,

            e.source_material_description
              AS material_description,

            COALESCE(
              e.downtime_minutes,
              0
            ) AS downtime_minutes,

            ${failureModeExpression}
              AS failure_mode,

            ${originExpression}
              AS failure_origin

          FROM
            maintenance_events e

          LEFT JOIN
            event_classifications ec
              ON ec.event_id =
                 e.id

          LEFT JOIN
            latest_suggestion latest
              ON latest.event_id =
                 e.id

          LEFT JOIN
            classification_suggestions cs
              ON cs.id =
                 latest.suggestion_id

          LEFT JOIN
            event_failure_origin_predictions
              origin_prediction
              ON origin_prediction.event_id =
                 e.id

          LEFT JOIN
            event_failure_origin_reviews
              origin_review
              ON origin_review.event_id =
                 e.id

          WHERE
            ${where.join(
              "\nAND ",
            )}
        )
      `;


    /* =====================================================
       TIMELINE

       Aqui usamos maintenance_events diretamente porque
       não precisamos das dimensões ML para construir a série.
       Isso evita joins desnecessários.
    ====================================================== */

    const periodExpression =
      buildPeriodExpression(
        grouping,
      );


    /* =====================================================
       CONSULTAS
    ====================================================== */

    const [
      summaryRows,
      failureRows,
      productRows,
      failureProductRows,
      originRows,
      timelineRows,
      lineRows,
    ] =
      await Promise.all([
        /* -------------------------------------------------
           RESUMO
        ------------------------------------------------- */

        executeRows<
          SummaryRow[]
        >(
          `
            ${baseCte}

            SELECT
              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes,

              SUM(
                base.failure_mode <>
                'Não classificado'
              )
                AS classified_occurrences,

              MIN(
                base.event_date
              )
                AS first_event_date,

              MAX(
                base.event_date
              )
                AS last_event_date

            FROM
              base
          `,
          params,
        ),


        /* -------------------------------------------------
           FALHAS
        ------------------------------------------------- */

        executeRows<
          FailureRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.failure_mode,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            WHERE
              base.failure_mode <>
              'Não classificado'

            GROUP BY
              base.failure_mode

            ORDER BY
              occurrences DESC,
              downtime_minutes DESC,
              base.failure_mode ASC
          `,
          params,
        ),


        /* -------------------------------------------------
           PRODUTOS
        ------------------------------------------------- */

        executeRows<
          ProductRow[]
        >(
          `
            ${baseCte}

            SELECT
              NULLIF(
                TRIM(
                  base.material_code
                ),
                ''
              )
                AS material_code,

              NULLIF(
                TRIM(
                  base.material_description
                ),
                ''
              )
                AS material_description,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            GROUP BY
              material_code,
              material_description

            ORDER BY
              occurrences DESC,
              downtime_minutes DESC
          `,
          params,
        ),


        /* -------------------------------------------------
           FALHA × PRODUTO
        ------------------------------------------------- */

        executeRows<
          FailureProductRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.failure_mode,

              NULLIF(
                TRIM(
                  base.material_code
                ),
                ''
              )
                AS material_code,

              NULLIF(
                TRIM(
                  base.material_description
                ),
                ''
              )
                AS material_description,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            WHERE
              base.failure_mode <>
              'Não classificado'

            GROUP BY
              base.failure_mode,
              material_code,
              material_description

            ORDER BY
              base.failure_mode ASC,
              occurrences DESC,
              downtime_minutes DESC
          `,
          params,
        ),


        /* -------------------------------------------------
           ORIGEM
        ------------------------------------------------- */

        executeRows<
          OriginRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.failure_origin
                AS origin,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            GROUP BY
              base.failure_origin
          `,
          params,
        ),


        /* -------------------------------------------------
           EVOLUÇÃO
        ------------------------------------------------- */

        executeRows<
          TimelineRow[]
        >(
          `
            SELECT
              ${periodExpression}
                AS period_start,

              COUNT(*)
                AS occurrences,

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
          params,
        ),


        /* -------------------------------------------------
           LINHAS ASSOCIADAS
        ------------------------------------------------- */

        executeRows<
          LineRow[]
        >(
          `
            ${baseCte}

            SELECT
              COALESCE(
                NULLIF(
                  TRIM(
                    base.line
                  ),
                  ''
                ),
                'Linha não informada'
              )
                AS line,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  base.downtime_minutes
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            GROUP BY
              line

            ORDER BY
              occurrences DESC,
              downtime_minutes DESC
          `,
          params,
        ),
      ]);


    /* =====================================================
       RESUMO
    ====================================================== */

    const summaryRow =
      summaryRows[
        0
      ];


    const occurrences =
      toNumber(
        summaryRow
          ?.occurrences,
      );


    const downtimeMinutes =
      toNumber(
        summaryRow
          ?.downtime_minutes,
      );


    const classifiedOccurrences =
      toNumber(
        summaryRow
          ?.classified_occurrences,
      );


    const mttr =
      occurrences >
      0
        ? downtimeMinutes /
          occurrences
        : 0;


    /* =====================================================
       FALHAS
    ====================================================== */

    const failures =
      failureRows.map(
        (
          row,
        ) => {
          const failureOccurrences =
            toNumber(
              row.occurrences,
            );


          const failureDowntime =
            toNumber(
              row.downtime_minutes,
            );


          const relatedProducts =
            failureProductRows
              .filter(
                (
                  productRow,
                ) =>
                  productRow.failure_mode ===
                  row.failure_mode,
              )
              .map(
                (
                  productRow,
                ) => {
                  const productOccurrences =
                    toNumber(
                      productRow
                        .occurrences,
                    );


                  const productDowntime =
                    toNumber(
                      productRow
                        .downtime_minutes,
                    );


                  const code =
                    cleanText(
                      productRow
                        .material_code,
                    );


                  const description =
                    cleanText(
                      productRow
                        .material_description,
                    );


                  return {
                    code,

                    description,

                    label:
                      buildProductLabel(
                        code,
                        description,
                      ),

                    occurrences:
                      productOccurrences,

                    downtimeMinutes:
                      round(
                        productDowntime,
                      ),

                    occurrencePercentage:
                      failureOccurrences >
                      0
                        ? round(
                            (
                              productOccurrences /
                              failureOccurrences
                            ) *
                              100,
                          )
                        : 0,
                  };
                },
              );


          return {
            failureMode:
              row.failure_mode,

            occurrences:
              failureOccurrences,

            downtimeMinutes:
              round(
                failureDowntime,
              ),

            mttr:
              failureOccurrences >
              0
                ? round(
                    failureDowntime /
                      failureOccurrences,
                  )
                : 0,

            occurrencePercentage:
              classifiedOccurrences >
              0
                ? round(
                    (
                      failureOccurrences /
                      classifiedOccurrences
                    ) *
                      100,
                  )
                : 0,

            downtimePercentage:
              downtimeMinutes >
              0
                ? round(
                    (
                      failureDowntime /
                      downtimeMinutes
                    ) *
                      100,
                  )
                : 0,

            products:
              relatedProducts
                .sort(
                  (
                    a,
                    b,
                  ) =>
                    b.occurrences -
                    a.occurrences,
                )
                .slice(
                  0,
                  5,
                ),
          };
        },
      );


    /* =====================================================
       PRODUTOS
    ====================================================== */

    const products =
      productRows
        .map(
          (
            row,
          ) => {
            const productOccurrences =
              toNumber(
                row.occurrences,
              );


            const productDowntime =
              toNumber(
                row.downtime_minutes,
              );


            const code =
              cleanText(
                row.material_code,
              );


            const description =
              cleanText(
                row.material_description,
              );


            return {
              code,

              description,

              label:
                buildProductLabel(
                  code,
                  description,
                ),

              occurrences:
                productOccurrences,

              downtimeMinutes:
                round(
                  productDowntime,
                ),

              occurrencePercentage:
                occurrences >
                0
                  ? round(
                      (
                        productOccurrences /
                        occurrences
                      ) *
                        100,
                    )
                  : 0,

              downtimePercentage:
                downtimeMinutes >
                0
                  ? round(
                      (
                        productDowntime /
                        downtimeMinutes
                      ) *
                        100,
                    )
                  : 0,
            };
          },
        )
        .slice(
          0,
          10,
        );


    /* =====================================================
       ORIGEM
    ====================================================== */

    const originMap =
      new Map<
        string,
        {
          occurrences: number;
          downtimeMinutes: number;
        }
      >();


    for (
      const row
      of originRows
    ) {
      originMap.set(
        row.origin,
        {
          occurrences:
            toNumber(
              row.occurrences,
            ),

          downtimeMinutes:
            toNumber(
              row.downtime_minutes,
            ),
        },
      );
    }


    const operation =
      originMap.get(
        "OPERACAO",
      ) ?? {
        occurrences:
          0,

        downtimeMinutes:
          0,
      };


    const maintenance =
      originMap.get(
        "MANUTENCAO",
      ) ?? {
        occurrences:
          0,

        downtimeMinutes:
          0,
      };


    const unclassifiedOrigin =
      originMap.get(
        "NAO_CLASSIFICADO",
      ) ?? {
        occurrences:
          0,

        downtimeMinutes:
          0,
      };


    const classifiedOrigin =
      operation.occurrences +
      maintenance.occurrences;


    /* =====================================================
       TIMELINE
    ====================================================== */

    const timeline =
      timelineRows.map(
        (
          row,
        ) => {
          const timelineOccurrences =
            toNumber(
              row.occurrences,
            );


          const timelineDowntime =
            toNumber(
              row.downtime_minutes,
            );


          return {
            periodStart:
              formatDatabaseDate(
                row.period_start,
              ),

            occurrences:
              timelineOccurrences,

            downtimeMinutes:
              round(
                timelineDowntime,
              ),

            mttr:
              timelineOccurrences >
              0
                ? round(
                    timelineDowntime /
                      timelineOccurrences,
                  )
                : 0,
          };
        },
      );


    /* =====================================================
       LINHAS
    ====================================================== */

    const lines =
      lineRows.map(
        (
          row,
        ) => {
          const lineOccurrences =
            toNumber(
              row.occurrences,
            );


          const lineDowntime =
            toNumber(
              row.downtime_minutes,
            );


          return {
            name:
              row.line,

            occurrences:
              lineOccurrences,

            downtimeMinutes:
              round(
                lineDowntime,
              ),

            mttr:
              lineOccurrences >
              0
                ? round(
                    lineDowntime /
                      lineOccurrences,
                  )
                : 0,
          };
        },
      );


    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

      equipment: {
        name:
          equipment,

        lines,

        firstEventDate:
          formatDatabaseDate(
            summaryRow
              ?.first_event_date ??
              null,
          ),

        lastEventDate:
          formatDatabaseDate(
            summaryRow
              ?.last_event_date ??
              null,
          ),
      },

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

        groupBy:
          grouping,
      },

      summary: {
        occurrences,

        downtimeMinutes:
          round(
            downtimeMinutes,
          ),

        mttr:
          round(
            mttr,
          ),

        classifiedOccurrences,

        unclassifiedOccurrences:
          Math.max(
            0,
            occurrences -
              classifiedOccurrences,
          ),

        classificationCoverage:
          occurrences >
          0
            ? round(
                (
                  classifiedOccurrences /
                  occurrences
                ) *
                  100,
              )
            : 0,

        failureModes:
          failures.length,

        products:
          products.length,
      },

      origin: {
        operation: {
          occurrences:
            operation
              .occurrences,

          downtimeMinutes:
            round(
              operation
                .downtimeMinutes,
            ),

          percentage:
            classifiedOrigin >
            0
              ? round(
                  (
                    operation
                      .occurrences /
                    classifiedOrigin
                  ) *
                    100,
                )
              : 0,
        },

        maintenance: {
          occurrences:
            maintenance
              .occurrences,

          downtimeMinutes:
            round(
              maintenance
                .downtimeMinutes,
            ),

          percentage:
            classifiedOrigin >
            0
              ? round(
                  (
                    maintenance
                      .occurrences /
                    classifiedOrigin
                  ) *
                    100,
                )
              : 0,
        },

        unclassified: {
          occurrences:
            unclassifiedOrigin
              .occurrences,

          downtimeMinutes:
            round(
              unclassifiedOrigin
                .downtimeMinutes,
            ),

          percentage:
            occurrences >
            0
              ? round(
                  (
                    unclassifiedOrigin
                      .occurrences /
                    occurrences
                  ) *
                    100,
                )
              : 0,
        },
      },

      failures,

      products,

      timeline,
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability/equipment-dna",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível gerar o DNA do equipamento.",
      },
      {
        status:
          500,
      },
    );
  }
}