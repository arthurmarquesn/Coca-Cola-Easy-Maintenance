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

import {
  buildDateWhere,
  FAILURE_MODE_EXPRESSION,
} from "@/lib/analytics/sql";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


/* =========================================================
   TIPOS
========================================================= */

interface OptionRow
  extends RowDataPacket {
  value: string;
}


interface AggregateRow
  extends RowDataPacket {
  label: string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface FailureOriginRow
  extends RowDataPacket {
  origin:
    | string
    | null;

  occurrences:
    | number
    | string;
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


interface FailureOriginSummary {
  operation: number;

  maintenance: number;

  unclassified: number;

  classified: number;

  total: number;

  operationPercentage: number;

  maintenancePercentage: number;

  unclassifiedPercentage: number;
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


/* =========================================================
   GET
========================================================= */

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await getSession();


  /* =======================================================
     AUTH
  ======================================================= */

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
       GLOBAL UNIT SELECTION
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


    const selectedSet =
      new Set(
        unitSelection
          .selectedUnitIds,
      );


    const selectedUnits =
      unitSelection
        .units
        .filter(
          (
            unit,
          ) =>
            selectedSet.has(
              unit.id,
            ),
        )
        .map(
          (
            unit,
          ) => ({
            id:
              unit.id,

            code:
              unit.code,

            name:
              unit.name,

            city:
              unit.city,

            state:
              unit.state,
          }),
        );


    /* =====================================================
       SEARCH PARAMS
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
       OPÇÕES DE LINHA

       - respeitam unidade e período
    ====================================================== */

    const lineParams:
      Array<
        string | number
      > = [
        ...unitFilter.values,
      ];


    const lineWhere =
      [
        `e.unit_id IN (${unitFilter.placeholders})`,

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

          FROM
            maintenance_events e

          WHERE
            ${lineWhere.join(
              "\nAND ",
            )}

          ORDER BY
            value ASC
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
        ...unitFilter.values,
      ];


    const equipmentWhere =
      [
        `e.unit_id IN (${unitFilter.placeholders})`,

        "e.source_equipment_name IS NOT NULL",

        "TRIM(e.source_equipment_name) <> ''",

        ...buildDateWhere(
          startDate,
          endDate,
          equipmentParams,
        ),
      ];


    if (
      line
    ) {
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

          FROM
            maintenance_events e

          WHERE
            ${equipmentWhere.join(
              "\nAND ",
            )}

          ORDER BY
            value ASC
        `,
        equipmentParams,
      );


    /* =====================================================
       FILTRO PRINCIPAL DA ANÁLISE

       Esse mesmo recorte será utilizado por:

       - Pareto
       - Jack-Knife
       - Origem das falhas
    ====================================================== */

    const params:
      Array<
        string | number
      > = [
        ...unitFilter.values,
      ];


    const where =
      [
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
     * A classificação oficial em event_classifications
     * sempre tem prioridade.
     *
     * classification_suggestions existe apenas como fallback
     * para preservar as classificações históricas já geradas
     * antes da retirada da tela do Modelo ML.
     */

    const failureModeExpression =
      FAILURE_MODE_EXPRESSION;


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


    /* =====================================================
       CONSULTA ANALÍTICA

       Alimenta:
       - Pareto
       - Jack-Knife
    ====================================================== */

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

            FROM
              classification_suggestions cs0

            WHERE
              cs0.model_type = 'ML'

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

          FROM
            base

          GROUP BY
            label

          ORDER BY
            downtime_minutes DESC,
            occurrences DESC,
            label ASC
        `,
        params,
      );


    /* =====================================================
       NORMALIZAÇÃO DA CONSULTA ANALÍTICA
    ====================================================== */

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
       ORIGEM DAS FALHAS

       A origem já foi calculada pelo modelo e persistida em:

       event_failure_origin_predictions

       Valores oficiais:

       - OPERACAO
       - MANUTENCAO

       Eventos ainda não classificados são preservados como
       NAO_CLASSIFICADO para não distorcer os percentuais.

       IMPORTANTE:

       A consulta utiliza exatamente o mesmo recorte de:

       - unidade
       - período
       - linha
       - equipamento

       utilizado pelo Pareto e Jack-Knife.
    ====================================================== */

    const failureOriginParams:
      Array<
        string | number
      > = [
        ...params,
      ];


    const failureOriginRows =
      await executeRows<
        FailureOriginRow[]
      >(
        `
          SELECT

            CASE

              WHEN
                UPPER(
                  TRIM(
                    COALESCE(
                      fop.failure_origin,
                      ''
                    )
                  )
                ) = 'OPERACAO'
              THEN
                'OPERACAO'

              WHEN
                UPPER(
                  TRIM(
                    COALESCE(
                      fop.failure_origin,
                      ''
                    )
                  )
                ) = 'MANUTENCAO'
              THEN
                'MANUTENCAO'

              ELSE
                'NAO_CLASSIFICADO'

            END AS origin,

            COUNT(*)
              AS occurrences

          FROM
            maintenance_events e

          LEFT JOIN
            event_failure_origin_predictions fop
              ON fop.event_id =
                 e.id

          WHERE
            ${where.join(
              "\nAND ",
            )}

          GROUP BY
            origin
        `,
        failureOriginParams,
      );


    let operationFailures =
      0;

    let maintenanceFailures =
      0;

    let unclassifiedFailures =
      0;


    for (
      const row
      of failureOriginRows
    ) {
      const occurrences =
        toNumber(
          row.occurrences,
        );


      switch (
        row.origin
      ) {
        case "OPERACAO":
          operationFailures +=
            occurrences;

          break;


        case "MANUTENCAO":
          maintenanceFailures +=
            occurrences;

          break;


        default:
          unclassifiedFailures +=
            occurrences;

          break;
      }
    }


    const classifiedFailures =
      operationFailures +
      maintenanceFailures;


    const failureOriginTotal =
      classifiedFailures +
      unclassifiedFailures;


    /*
     * Os percentuais de Operação e Manutenção são calculados
     * sobre as ocorrências efetivamente classificadas.
     *
     * Isso evita que registros ainda sem classificação
     * alterem artificialmente a relação:
     *
     * Operação x Manutenção.
     */

    const operationPercentage =
      classifiedFailures >
      0
        ? (
            operationFailures /
            classifiedFailures
          ) *
          100
        : 0;


    const maintenancePercentage =
      classifiedFailures >
      0
        ? (
            maintenanceFailures /
            classifiedFailures
          ) *
          100
        : 0;


    /*
     * O percentual não classificado utiliza o universo total,
     * pois representa a cobertura atual da classificação.
     */

    const unclassifiedPercentage =
      failureOriginTotal >
      0
        ? (
            unclassifiedFailures /
            failureOriginTotal
          ) *
          100
        : 0;


    const failureOrigin:
      FailureOriginSummary =
      {
        operation:
          operationFailures,

        maintenance:
          maintenanceFailures,

        unclassified:
          unclassifiedFailures,

        classified:
          classifiedFailures,

        total:
          failureOriginTotal,

        operationPercentage:
          round(
            operationPercentage,
          ),

        maintenancePercentage:
          round(
            maintenancePercentage,
          ),

        unclassifiedPercentage:
          round(
            unclassifiedPercentage,
          ),
      };


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

       - Todas as categorias
       - Sem agrupamento em "Outros"
       - Paginação é responsabilidade da interface
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


    let cumulative =
      0;


    const pareto:
      ParetoItem[] =
      sortedPareto.map(
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


    /* =====================================================
       SUMMARY
    ====================================================== */

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


    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,


      /* ---------------------------------------------------
         NÍVEL DA ANÁLISE
      --------------------------------------------------- */

      analysisLevel:
        equipment
          ? "FAILURE_MODE"
          : "EQUIPMENT",


      /* ---------------------------------------------------
         FILTROS
      --------------------------------------------------- */

      filters: {
        selectedUnitIds:
          unitSelection
            .selectedUnitIds,


        selectedUnits,


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


      /* ---------------------------------------------------
         RESUMO GERAL
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         ORIGEM DAS FALHAS

         Novo bloco.
      --------------------------------------------------- */

      failureOrigin,


      /* ---------------------------------------------------
         PARETO
      --------------------------------------------------- */

      pareto,


      /* ---------------------------------------------------
         JACK-KNIFE
      --------------------------------------------------- */

      jackKnife,


      /* ---------------------------------------------------
         LIMITES JACK-KNIFE
      --------------------------------------------------- */

      jackKnifeLimits: {
        /*
         * frequency é o nome consumido pela interface.
         *
         * failures é mantido por compatibilidade com
         * versões anteriores do endpoint.
         */

        frequency:
          round(
            failuresAverage,
          ),

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