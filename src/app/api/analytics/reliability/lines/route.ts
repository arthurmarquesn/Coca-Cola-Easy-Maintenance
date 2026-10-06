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

interface LineAggregateRow
  extends RowDataPacket {
  line_name:
    string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;

  operation_occurrences:
    | number
    | string
    | null;

  maintenance_occurrences:
    | number
    | string
    | null;

  unclassified_occurrences:
    | number
    | string
    | null;

  operation_downtime:
    | number
    | string
    | null;

  maintenance_downtime:
    | number
    | string
    | null;

  unclassified_downtime:
    | number
    | string
    | null;
}


interface EquipmentRow
  extends RowDataPacket {
  line_name:
    string;

  equipment_name:
    string;

  occurrences:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}


interface LineEquipmentItem {
  name: string;

  occurrences: number;

  downtimeMinutes: number;

  mttr: number;
}


interface OriginItem {
  occurrences: number;

  downtimeMinutes: number;

  occurrencePercentage: number;

  downtimePercentage: number;
}


interface LineItem {
  line: string;

  occurrences: number;

  downtimeMinutes: number;

  mttr: number;

  occurrencePercentage: number;

  downtimePercentage: number;

  origin: {
    operation:
      OriginItem;

    maintenance:
      OriginItem;

    unclassified:
      OriginItem;
  };

  topEquipment:
    | LineEquipmentItem
    | null;

  equipments:
    LineEquipmentItem[];
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


    if (
      startDate &&
      endDate &&
      startDate >
      endDate
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "A data inicial não pode ser posterior à data final.",
        },
        {
          status:
            400,
        },
      );
    }


    /* =====================================================
       FILTROS
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


    /* =====================================================
       ORIGEM EFETIVA

       Revisão humana tem prioridade sobre a classificação
       automática.
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
       BASE

       Mantemos somente uma linha por evento.
    ====================================================== */

    const baseCte =
      `
        WITH base AS (
          SELECT
            e.id,

            COALESCE(
              NULLIF(
                TRIM(
                  e.source_line_name
                ),
                ''
              ),
              'Linha não informada'
            )
              AS line_name,

            COALESCE(
              NULLIF(
                TRIM(
                  e.source_equipment_name
                ),
                ''
              ),
              'Equipamento não informado'
            )
              AS equipment_name,

            COALESCE(
              e.downtime_minutes,
              0
            )
              AS downtime_minutes,

            ${originExpression}
              AS failure_origin

          FROM
            maintenance_events e

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
       CONSULTAS
    ====================================================== */

    const [
      lineRows,
      equipmentRows,
    ] =
      await Promise.all([
        executeRows<
          LineAggregateRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.line_name,

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
                CASE
                  WHEN base.failure_origin =
                    'OPERACAO'
                  THEN 1
                  ELSE 0
                END
              )
                AS operation_occurrences,

              SUM(
                CASE
                  WHEN base.failure_origin =
                    'MANUTENCAO'
                  THEN 1
                  ELSE 0
                END
              )
                AS maintenance_occurrences,

              SUM(
                CASE
                  WHEN base.failure_origin =
                    'NAO_CLASSIFICADO'
                  THEN 1
                  ELSE 0
                END
              )
                AS unclassified_occurrences,

              COALESCE(
                SUM(
                  CASE
                    WHEN base.failure_origin =
                      'OPERACAO'
                    THEN base.downtime_minutes
                    ELSE 0
                  END
                ),
                0
              )
                AS operation_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN base.failure_origin =
                      'MANUTENCAO'
                    THEN base.downtime_minutes
                    ELSE 0
                  END
                ),
                0
              )
                AS maintenance_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN base.failure_origin =
                      'NAO_CLASSIFICADO'
                    THEN base.downtime_minutes
                    ELSE 0
                  END
                ),
                0
              )
                AS unclassified_downtime

            FROM
              base

            GROUP BY
              base.line_name

            ORDER BY
              downtime_minutes DESC,
              occurrences DESC,
              base.line_name ASC
          `,
          params,
        ),


        executeRows<
          EquipmentRow[]
        >(
          `
            ${baseCte}

            SELECT
              base.line_name,

              base.equipment_name,

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
              base.line_name,
              base.equipment_name

            ORDER BY
              base.line_name ASC,
              downtime_minutes DESC,
              occurrences DESC,
              base.equipment_name ASC
          `,
          params,
        ),
      ]);


    /* =====================================================
       TOTAIS
    ====================================================== */

    const totalOccurrences =
      lineRows.reduce(
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
      lineRows.reduce(
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
       EQUIPAMENTOS POR LINHA
    ====================================================== */

    const equipmentsByLine =
      new Map<
        string,
        LineEquipmentItem[]
      >();


    for (
      const row
      of equipmentRows
    ) {
      const occurrences =
        toNumber(
          row.occurrences,
        );


      const downtimeMinutes =
        toNumber(
          row.downtime_minutes,
        );


      const item:
        LineEquipmentItem = {
          name:
            row.equipment_name,

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
        };


      const current =
        equipmentsByLine.get(
          row.line_name,
        ) ??
        [];


      current.push(
        item,
      );


      equipmentsByLine.set(
        row.line_name,
        current,
      );
    }


    /* =====================================================
       NORMALIZAÇÃO DAS LINHAS
    ====================================================== */

    const items:
      LineItem[] =
      lineRows.map(
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


          const operationOccurrences =
            toNumber(
              row.operation_occurrences,
            );


          const maintenanceOccurrences =
            toNumber(
              row.maintenance_occurrences,
            );


          const unclassifiedOccurrences =
            toNumber(
              row.unclassified_occurrences,
            );


          const operationDowntime =
            toNumber(
              row.operation_downtime,
            );


          const maintenanceDowntime =
            toNumber(
              row.maintenance_downtime,
            );


          const unclassifiedDowntime =
            toNumber(
              row.unclassified_downtime,
            );


          const classifiedOccurrences =
            operationOccurrences +
            maintenanceOccurrences;


          const classifiedDowntime =
            operationDowntime +
            maintenanceDowntime;


          const equipments =
            (
              equipmentsByLine.get(
                row.line_name,
              ) ??
              []
            )
              .sort(
                (
                  a,
                  b,
                ) => {
                  if (
                    b.downtimeMinutes !==
                    a.downtimeMinutes
                  ) {
                    return (
                      b.downtimeMinutes -
                      a.downtimeMinutes
                    );
                  }


                  return (
                    b.occurrences -
                    a.occurrences
                  );
                },
              );


          return {
            line:
              row.line_name,

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
              totalOccurrences >
              0
                ? round(
                    (
                      occurrences /
                      totalOccurrences
                    ) *
                      100,
                  )
                : 0,

            downtimePercentage:
              totalDowntimeMinutes >
              0
                ? round(
                    (
                      downtimeMinutes /
                      totalDowntimeMinutes
                    ) *
                      100,
                  )
                : 0,

            origin: {
              operation: {
                occurrences:
                  operationOccurrences,

                downtimeMinutes:
                  round(
                    operationDowntime,
                  ),

                occurrencePercentage:
                  classifiedOccurrences >
                  0
                    ? round(
                        (
                          operationOccurrences /
                          classifiedOccurrences
                        ) *
                          100,
                      )
                    : 0,

                downtimePercentage:
                  classifiedDowntime >
                  0
                    ? round(
                        (
                          operationDowntime /
                          classifiedDowntime
                        ) *
                          100,
                      )
                    : 0,
              },

              maintenance: {
                occurrences:
                  maintenanceOccurrences,

                downtimeMinutes:
                  round(
                    maintenanceDowntime,
                  ),

                occurrencePercentage:
                  classifiedOccurrences >
                  0
                    ? round(
                        (
                          maintenanceOccurrences /
                          classifiedOccurrences
                        ) *
                          100,
                      )
                    : 0,

                downtimePercentage:
                  classifiedDowntime >
                  0
                    ? round(
                        (
                          maintenanceDowntime /
                          classifiedDowntime
                        ) *
                          100,
                      )
                    : 0,
              },

              unclassified: {
                occurrences:
                  unclassifiedOccurrences,

                downtimeMinutes:
                  round(
                    unclassifiedDowntime,
                  ),

                occurrencePercentage:
                  occurrences >
                  0
                    ? round(
                        (
                          unclassifiedOccurrences /
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
                          unclassifiedDowntime /
                          downtimeMinutes
                        ) *
                          100,
                      )
                    : 0,
              },
            },

            topEquipment:
              equipments[
                0
              ] ??
              null,

            equipments:
              equipments.slice(
                0,
                5,
              ),
          };
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
        lines:
          items.length,

        occurrences:
          totalOccurrences,

        downtimeMinutes:
          round(
            totalDowntimeMinutes,
          ),

        mttr:
          totalOccurrences >
          0
            ? round(
                totalDowntimeMinutes /
                totalOccurrences,
              )
            : 0,
      },

      items,
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability/lines",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar o impacto por linha.",
      },
      {
        status:
          500,
      },
    );
  }
}