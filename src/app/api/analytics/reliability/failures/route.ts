import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isDateValue as isCalendarDate,
} from "@/lib/analytics/sql";

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

interface FailureRow
  extends RowDataPacket {
  failure_mode: string;

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
  failure_mode: string;

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


interface FailureProductItem {
  code:
    | string
    | null;

  description:
    | string
    | null;

  label: string;

  occurrences: number;

  downtimeMinutes: number;

  occurrencePercentage: number;

  downtimePercentage: number;
}


interface FailureItem {
  failureMode: string;

  occurrences: number;

  downtimeMinutes: number;

  mttr: number;

  occurrencePercentage: number;

  downtimePercentage: number;

  products:
    FailureProductItem[];

  topProduct:
    | FailureProductItem
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
    | string
    | null,
): value is string {
  /* Formato e data real: 2026-02-31 é recusado. */
  return isCalendarDate(
    value,
  );
}


function buildDateWhere(
  startDate:
    | string
    | null,
  endDate:
    | string
    | null,
  params:
    Array<
      string | number
    >,
): string[] {
  const where:
    string[] = [];


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


  const cleaned =
    value.trim();


  return cleaned ||
    null;
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
       FILTROS
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


    /* =====================================================
       WHERE
    ====================================================== */

    const params:
      Array<
        string | number
      > = [
        ...unitFilter.values,
      ];


    const where:
      string[] = [
        `e.unit_id IN (${unitFilter.placeholders})`,

        ...buildDateWhere(
          startDate,
          endDate,
          params,
        ),
      ];


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


    if (
      equipment
    ) {
      where.push(
        "TRIM(e.source_equipment_name) = ?",
      );

      params.push(
        equipment,
      );
    }


    /*
     * Regra oficial de classificação.
     *
     * Ordem de prioridade:
     *
     * 1. classificação oficial salva em event_classifications;
     * 2. sugestão ML mais recente;
     * 3. Não classificado.
     *
     * É a mesma regra usada na análise de confiabilidade.
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
            TRIM(
              cs.failure_mode
            ),
            ''
          ),

          'Não classificado'
        )
      `;


    /* =====================================================
       CTE BASE

       Uma linha por evento.

       Já levamos produto/material para a mesma base porque
       essa dimensão será usada futuramente pelo DNA.
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

            e.downtime_minutes,

            NULLIF(
              TRIM(
                e.source_material_code
              ),
              ''
            ) AS material_code,

            NULLIF(
              TRIM(
                e.source_material_description
              ),
              ''
            ) AS material_description,

            ${failureModeExpression}
              AS failure_mode

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

          WHERE
            ${where.join(
              "\nAND ",
            )}
        )
      `;


    /* =====================================================
       CONSULTAS

       1. agregado por falha
       2. falha × produto

       Ambas usam exatamente a mesma base.
    ====================================================== */

    const [
      failureRows,
      productRows,
    ] =
      await Promise.all([
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
                  COALESCE(
                    base.downtime_minutes,
                    0
                  )
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            GROUP BY
              base.failure_mode

            ORDER BY
              occurrences DESC,
              downtime_minutes DESC,
              base.failure_mode ASC
          `,
          params,
        ),

        executeRows<
          FailureProductRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.failure_mode,

              base.material_code,

              base.material_description,

              COUNT(*)
                AS occurrences,

              COALESCE(
                SUM(
                  COALESCE(
                    base.downtime_minutes,
                    0
                  )
                ),
                0
              )
                AS downtime_minutes

            FROM
              base

            GROUP BY
              base.failure_mode,
              base.material_code,
              base.material_description

            ORDER BY
              base.failure_mode ASC,
              occurrences DESC,
              downtime_minutes DESC
          `,
          params,
        ),
      ]);


    /* =====================================================
       TOTAIS
    ====================================================== */

    const totalEvents =
      failureRows.reduce(
        (
          total,
          row,
        ) =>
          total +
          toNumber(
            row.occurrences,
          ),
        0,
      );


    const totalDowntimeMinutes =
      failureRows.reduce(
        (
          total,
          row,
        ) =>
          total +
          toNumber(
            row.downtime_minutes,
          ),
        0,
      );


    const unclassifiedRow =
      failureRows.find(
        (
          row,
        ) =>
          row.failure_mode ===
          "Não classificado",
      );


    const unclassifiedEvents =
      toNumber(
        unclassifiedRow
          ?.occurrences,
      );


    const classifiedEvents =
      Math.max(
        0,
        totalEvents -
          unclassifiedEvents,
      );


    const classifiedDowntimeMinutes =
      failureRows
        .filter(
          (
            row,
          ) =>
            row.failure_mode !==
            "Não classificado",
        )
        .reduce(
          (
            total,
            row,
          ) =>
            total +
            toNumber(
              row.downtime_minutes,
            ),
          0,
        );


    /* =====================================================
       PRODUTOS POR FALHA
    ====================================================== */

    const productsByFailure =
      new Map<
        string,
        Array<{
          code:
            string | null;

          description:
            string | null;

          occurrences:
            number;

          downtimeMinutes:
            number;
        }>
      >();


    for (
      const row
      of productRows
    ) {
      const failureMode =
        row.failure_mode;


      const products =
        productsByFailure.get(
          failureMode,
        ) ??
        [];


      products.push({
        code:
          cleanText(
            row.material_code,
          ),

        description:
          cleanText(
            row.material_description,
          ),

        occurrences:
          toNumber(
            row.occurrences,
          ),

        downtimeMinutes:
          toNumber(
            row.downtime_minutes,
          ),
      });


      productsByFailure.set(
        failureMode,
        products,
      );
    }


    /* =====================================================
       NORMALIZAÇÃO
    ====================================================== */

    const items:
      FailureItem[] =
      failureRows
        .filter(
          (
            row,
          ) =>
            row.failure_mode !==
            "Não classificado",
        )
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


            const rawProducts =
              productsByFailure.get(
                row.failure_mode,
              ) ??
              [];


            const products:
              FailureProductItem[] =
              rawProducts
                .map(
                  (
                    product,
                  ) => ({
                    code:
                      product.code,

                    description:
                      product.description,

                    label:
                      buildProductLabel(
                        product.code,
                        product.description,
                      ),

                    occurrences:
                      product.occurrences,

                    downtimeMinutes:
                      round(
                        product
                          .downtimeMinutes,
                      ),

                    occurrencePercentage:
                      occurrences >
                      0
                        ? round(
                            (
                              product
                                .occurrences /
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
                              product
                                .downtimeMinutes /
                              downtimeMinutes
                            ) *
                              100,
                          )
                        : 0,
                  }),
                )
                .sort(
                  (
                    a,
                    b,
                  ) => {
                    if (
                      b.occurrences !==
                      a.occurrences
                    ) {
                      return (
                        b.occurrences -
                        a.occurrences
                      );
                    }


                    if (
                      b.downtimeMinutes !==
                      a.downtimeMinutes
                    ) {
                      return (
                        b.downtimeMinutes -
                        a.downtimeMinutes
                      );
                    }


                    return a.label
                      .localeCompare(
                        b.label,
                        "pt-BR",
                      );
                  },
                );


            return {
              failureMode:
                row.failure_mode,

              occurrences,

              downtimeMinutes:
                round(
                  downtimeMinutes,
                ),

              mttr:
                occurrences >
                0
                  ? round(
                      downtimeMinutes /
                        occurrences,
                    )
                  : 0,

              occurrencePercentage:
                classifiedEvents >
                0
                  ? round(
                      (
                        occurrences /
                        classifiedEvents
                      ) *
                        100,
                    )
                  : 0,

              downtimePercentage:
                classifiedDowntimeMinutes >
                0
                  ? round(
                      (
                        downtimeMinutes /
                        classifiedDowntimeMinutes
                      ) *
                        100,
                    )
                  : 0,

              products,

              topProduct:
                products[
                  0
                ] ??
                null,
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) => {
            if (
              b.occurrences !==
              a.occurrences
            ) {
              return (
                b.occurrences -
                a.occurrences
              );
            }


            if (
              b.downtimeMinutes !==
              a.downtimeMinutes
            ) {
              return (
                b.downtimeMinutes -
                a.downtimeMinutes
              );
            }


            return a
              .failureMode
              .localeCompare(
                b.failureMode,
                "pt-BR",
              );
          },
        );


    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

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

      summary: {
        totalEvents,

        classifiedEvents,

        unclassifiedEvents,

        classificationCoverage:
          totalEvents >
          0
            ? round(
                (
                  classifiedEvents /
                  totalEvents
                ) *
                  100,
              )
            : 0,

        failureModes:
          items.length,

        downtimeMinutes:
          round(
            totalDowntimeMinutes,
          ),

        classifiedDowntimeMinutes:
          round(
            classifiedDowntimeMinutes,
          ),
      },

      items,
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability/failures",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar as falhas recorrentes.",
      },
      {
        status:
          500,
      },
    );
  }
}