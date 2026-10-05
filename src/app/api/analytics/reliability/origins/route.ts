import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  executeRows,
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";

<<<<<<< HEAD
import {
  FAILURE_ORIGIN_JOINS,
  containsLikePattern,
} from "@/lib/analytics/sql";


=======
>>>>>>> origin/marques
export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

type FailureOrigin =
  | "OPERACAO"
  | "MANUTENCAO";

type EffectiveFailureOrigin =
  | FailureOrigin
  | "NAO_CLASSIFICADO";

type OriginsView =
  | "EVENTS"
  | "SUMMARY";

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string;
}

interface OriginEventRow
  extends RowDataPacket {
  id: number;

  event_date:
    | string
    | Date
    | null;

  source_line_name:
    | string
    | null;

  source_equipment_name:
    | string
    | null;

  source_stop_type:
    | string
    | null;

  source_stop_subkey:
    | string
    | null;

  source_stop_key_1:
    | string
    | null;

  observation:
    | string
    | null;

  downtime_minutes:
    | number
    | string
    | null;

  predicted_origin:
    | string
    | null;

  prediction_confidence:
    | number
    | string
    | null;

  prediction_confidence_level:
    | string
    | null;

  model_version:
    | string
    | null;

  manual_origin:
    | string
    | null;

  review_note:
    | string
    | null;

  reviewed_at:
    | string
    | Date
    | null;

  reviewed_by_user_id:
    | number
    | null;

  reviewed_by_name:
    | string
    | null;

  effective_origin:
    | string
    | null;
}

interface EventAccessRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
}

interface CurrentReviewRow
  extends RowDataPacket {
  id: number;

  manual_origin:
    FailureOrigin;

  review_note:
    | string
    | null;
}

interface PatchBody {
  eventId?: unknown;
  manualOrigin?: unknown;
  note?: unknown;
}

/* =========================================================
   TIPOS DO RESUMO ANALÍTICO
========================================================= */

interface OriginSummaryRow
  extends RowDataPacket {
  total:
    | number
    | string;

  operation_count:
    | number
    | string;

  maintenance_count:
    | number
    | string;

  unclassified_count:
    | number
    | string;

  reviewed_count:
    | number
    | string;

  model_only_count:
    | number
    | string;

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

interface OriginTimelineRow
  extends RowDataPacket {
  period:
    | string
    | Date
    | null;

  total:
    | number
    | string;

  operation_count:
    | number
    | string;

  maintenance_count:
    | number
    | string;

  unclassified_count:
    | number
    | string;

  reviewed_count:
    | number
    | string;

  downtime_minutes:
    | number
    | string
    | null;
}

interface OriginLineRow
  extends RowDataPacket {
  line_name:
    | string
    | null;

  total:
    | number
    | string;

  operation_count:
    | number
    | string;

  maintenance_count:
    | number
    | string;

  unclassified_count:
    | number
    | string;

  reviewed_count:
    | number
    | string;

  downtime_minutes:
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

function normalizeOrigin(
  value: unknown,
): FailureOrigin | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "OPERACAO"
  ) {
    return "OPERACAO";
  }

  if (
    normalized ===
    "MANUTENCAO"
  ) {
    return "MANUTENCAO";
  }

  return null;
}

function normalizeEffectiveOrigin(
  value: unknown,
): EffectiveFailureOrigin {
  if (
    typeof value !==
    "string"
  ) {
    return "NAO_CLASSIFICADO";
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "OPERACAO"
  ) {
    return "OPERACAO";
  }

  if (
    normalized ===
    "MANUTENCAO"
  ) {
    return "MANUTENCAO";
  }

  return "NAO_CLASSIFICADO";
}

function normalizeNote(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .slice(
        0,
        500,
      );

  return (
    normalized ||
    null
  );
}

function formatDate(
  value:
    | string
    | Date
    | null,
): string | null {
  if (
    value === null
  ) {
    return null;
  }

  if (
    value instanceof
    Date
  ) {
    const year =
      value.getUTCFullYear();

    const month =
      String(
        value.getUTCMonth() +
          1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        value.getUTCDate(),
      ).padStart(
        2,
        "0",
      );

    return `${year}-${month}-${day}`;
  }

  const text =
    String(
      value,
    );

  return text.length >=
    10
    ? text.slice(
        0,
        10,
      )
    : text;
}

function formatDateTime(
  value:
    | string
    | Date
    | null,
): string | null {
  if (
    value === null
  ) {
    return null;
  }

  if (
    value instanceof
    Date
  ) {
    return value.toISOString();
  }

  return String(
    value,
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

function percentage(
  value: number,
  total: number,
): number {
  if (
    total <= 0
  ) {
    return 0;
  }

  return (
    value /
    total
  ) *
    100;
}

/* =========================================================
   GET

   DOIS MODOS:

   1. EVENTS
      GET /api/analytics/reliability/origins

      Mantém o comportamento atual:
      lista paginada de ocorrências e revisão.

   2. SUMMARY
      GET /api/analytics/reliability/origins?view=summary

      Retorna:
      - resumo operação × manutenção × não classificado;
      - revisões manuais;
      - classificação somente pelo modelo;
      - evolução diária;
      - distribuição por linha.

   PRIORIDADE DA ORIGEM:

   1. revisão manual
   2. previsão ML
   3. não classificado
========================================================= */

export async function GET(
  request: NextRequest,
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
       PARAMS
    ====================================================== */

    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const requestedViewRaw =
      searchParams
        .get(
          "view",
        )
        ?.trim()
        .toUpperCase() ||
      "";

    const view:
      OriginsView =
      requestedViewRaw ===
        "SUMMARY"
        ? "SUMMARY"
        : "EVENTS";

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

    const search =
      searchParams
        .get(
          "search",
        )
        ?.trim()
        .slice(
          0,
          120,
        ) ||
      "";

    const requestedOriginRaw =
      searchParams
        .get(
          "origin",
        )
        ?.trim()
        .toUpperCase() ||
      "";

    const requestedOrigin:
      EffectiveFailureOrigin | null =
      requestedOriginRaw ===
        "OPERACAO"
        ? "OPERACAO"
        : requestedOriginRaw ===
            "MANUTENCAO"
          ? "MANUTENCAO"
          : requestedOriginRaw ===
              "NAO_CLASSIFICADO"
            ? "NAO_CLASSIFICADO"
            : null;

    const requestedPage =
      Number(
        searchParams.get(
          "page",
        ) ??
          1,
      );

    const requestedPageSize =
      Number(
        searchParams.get(
          "pageSize",
        ) ??
          20,
      );

    const page =
      Number.isInteger(
        requestedPage,
      ) &&
      requestedPage >
        0
        ? requestedPage
        : 1;

    const pageSize =
      Number.isInteger(
        requestedPageSize,
      )
        ? Math.min(
            100,
            Math.max(
              10,
              requestedPageSize,
            ),
          )
        : 20;

    /* =====================================================
       FILTROS BASE

       São os filtros analíticos globais.

       O resumo e a lista utilizam exatamente o mesmo
       universo de eventos:

       - unidade
       - período
       - linha
       - equipamento
    ====================================================== */

    const baseWhere:
      string[] = [
        `e.unit_id IN (${unitFilter.placeholders})`,
      ];

    const baseValues:
      Array<
        string | number
      > = [
        ...unitFilter.values,
      ];

    if (
      isDateValue(
        startDate,
      )
    ) {
      baseWhere.push(
        "e.event_date >= ?",
      );

      baseValues.push(
        startDate,
      );
    }

    if (
      isDateValue(
        endDate,
      )
    ) {
      baseWhere.push(
        "e.event_date <= ?",
      );

      baseValues.push(
        endDate,
      );
    }

    if (
      line
    ) {
      baseWhere.push(
        "TRIM(e.source_line_name) = ?",
      );

      baseValues.push(
        line,
      );
    }

    if (
      equipment
    ) {
      baseWhere.push(
        "TRIM(e.source_equipment_name) = ?",
      );

      baseValues.push(
        equipment,
      );
    }

    /* =====================================================
       CTE BASE

       A definição da origem existe somente aqui.

       Isso garante consistência entre:

       - resumo;
       - evolução;
       - linhas;
       - drawer/listagem.

       REGRA:

       revisão manual
            ↓
       previsão do modelo
            ↓
       não classificado
    ====================================================== */

    const baseSql =
      `
        WITH origin_base AS (
          SELECT
            e.id,

            e.event_date,

            e.source_line_name,

            e.source_equipment_name,

            e.source_stop_type,

            e.source_stop_subkey,

            e.source_stop_key_1,

            e.observation,

            e.downtime_minutes,

            prediction.failure_origin
              AS predicted_origin,

            prediction.confidence
              AS prediction_confidence,

            prediction.confidence_level
              AS prediction_confidence_level,

            prediction.model_version,

            review.manual_origin,

            review.review_note,

            review.reviewed_at,

            review.reviewed_by_user_id,

            reviewer.name
              AS reviewed_by_name,

            CASE
              WHEN
                UPPER(
                  TRIM(
                    COALESCE(
                      review.manual_origin,
                      prediction.failure_origin,
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
                      review.manual_origin,
                      prediction.failure_origin,
                      ''
                    )
                  )
                ) = 'MANUTENCAO'
              THEN
                'MANUTENCAO'

              ELSE
                'NAO_CLASSIFICADO'
            END
              AS effective_origin

          FROM
            maintenance_events e

          ${FAILURE_ORIGIN_JOINS}

          LEFT JOIN
            users reviewer
              ON reviewer.id =
                 review.reviewed_by_user_id

          WHERE
            ${baseWhere.join(
              "\nAND ",
            )}
        )
      `;

    /* =====================================================
       VIEW = SUMMARY
    ====================================================== */

    if (
      view ===
      "SUMMARY"
    ) {
      /* ===================================================
         RESUMO
      ==================================================== */

      const summaryPromise =
        executeRows<
          OriginSummaryRow[]
        >(
          `
            ${baseSql}

            SELECT
              COUNT(*)
                AS total,

              SUM(
                CASE
                  WHEN effective_origin = 'OPERACAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS operation_count,

              SUM(
                CASE
                  WHEN effective_origin = 'MANUTENCAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS maintenance_count,

              SUM(
                CASE
                  WHEN effective_origin = 'NAO_CLASSIFICADO'
                    THEN 1
                  ELSE 0
                END
              )
                AS unclassified_count,

              SUM(
                CASE
                  WHEN manual_origin IS NOT NULL
                    THEN 1
                  ELSE 0
                END
              )
                AS reviewed_count,

              SUM(
                CASE
                  WHEN
                    manual_origin IS NULL
                    AND UPPER(
                      TRIM(
                        COALESCE(
                          predicted_origin,
                          ''
                        )
                      )
                    ) IN (
                      'OPERACAO',
                      'MANUTENCAO'
                    )
                  THEN 1
                  ELSE 0
                END
              )
                AS model_only_count,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'OPERACAO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS operation_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'MANUTENCAO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS maintenance_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'NAO_CLASSIFICADO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS unclassified_downtime

            FROM
              origin_base
          `,
          [
            ...baseValues,
          ],
        );

      /* ===================================================
         EVOLUÇÃO TEMPORAL

         O agrupamento inicial é diário.

         Na interface podemos transformar visualmente em
         semana/mês sem perder os dados originais.
      ==================================================== */

      const timelinePromise =
        executeRows<
          OriginTimelineRow[]
        >(
          `
            ${baseSql}

            SELECT
              DATE(event_date)
                AS period,

              COUNT(*)
                AS total,

              SUM(
                CASE
                  WHEN effective_origin = 'OPERACAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS operation_count,

              SUM(
                CASE
                  WHEN effective_origin = 'MANUTENCAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS maintenance_count,

              SUM(
                CASE
                  WHEN effective_origin = 'NAO_CLASSIFICADO'
                    THEN 1
                  ELSE 0
                END
              )
                AS unclassified_count,

              SUM(
                CASE
                  WHEN manual_origin IS NOT NULL
                    THEN 1
                  ELSE 0
                END
              )
                AS reviewed_count,

              COALESCE(
                SUM(
                  COALESCE(
                    downtime_minutes,
                    0
                  )
                ),
                0
              )
                AS downtime_minutes

            FROM
              origin_base

            WHERE
              event_date IS NOT NULL

            GROUP BY
              DATE(event_date)

            ORDER BY
              DATE(event_date) ASC
          `,
          [
            ...baseValues,
          ],
        );

      /* ===================================================
         DISTRIBUIÇÃO POR LINHA
      ==================================================== */

      const byLinePromise =
        executeRows<
          OriginLineRow[]
        >(
          `
            ${baseSql}

            SELECT
              COALESCE(
                NULLIF(
                  TRIM(
                    source_line_name
                  ),
                  ''
                ),
                'Linha não informada'
              )
                AS line_name,

              COUNT(*)
                AS total,

              SUM(
                CASE
                  WHEN effective_origin = 'OPERACAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS operation_count,

              SUM(
                CASE
                  WHEN effective_origin = 'MANUTENCAO'
                    THEN 1
                  ELSE 0
                END
              )
                AS maintenance_count,

              SUM(
                CASE
                  WHEN effective_origin = 'NAO_CLASSIFICADO'
                    THEN 1
                  ELSE 0
                END
              )
                AS unclassified_count,

              SUM(
                CASE
                  WHEN manual_origin IS NOT NULL
                    THEN 1
                  ELSE 0
                END
              )
                AS reviewed_count,

              COALESCE(
                SUM(
                  COALESCE(
                    downtime_minutes,
                    0
                  )
                ),
                0
              )
                AS downtime_minutes,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'OPERACAO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS operation_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'MANUTENCAO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS maintenance_downtime,

              COALESCE(
                SUM(
                  CASE
                    WHEN effective_origin = 'NAO_CLASSIFICADO'
                      THEN COALESCE(
                        downtime_minutes,
                        0
                      )
                    ELSE 0
                  END
                ),
                0
              )
                AS unclassified_downtime

            FROM
              origin_base

            GROUP BY
              COALESCE(
                NULLIF(
                  TRIM(
                    source_line_name
                  ),
                  ''
                ),
                'Linha não informada'
              )

            ORDER BY
              total DESC,
              line_name ASC
          `,
          [
            ...baseValues,
          ],
        );

      const [
        summaryRows,
        timelineRows,
        lineRows,
      ] =
        await Promise.all([
          summaryPromise,
          timelinePromise,
          byLinePromise,
        ]);

      const summaryRow =
        summaryRows[
          0
        ];

      const total =
        toNumber(
          summaryRow
            ?.total,
        );

      const operation =
        toNumber(
          summaryRow
            ?.operation_count,
        );

      const maintenance =
        toNumber(
          summaryRow
            ?.maintenance_count,
        );

      const unclassified =
        toNumber(
          summaryRow
            ?.unclassified_count,
        );

      const reviewed =
        toNumber(
          summaryRow
            ?.reviewed_count,
        );

      const modelOnly =
        toNumber(
          summaryRow
            ?.model_only_count,
        );

      const classified =
        operation +
        maintenance;

      const operationDowntimeMinutes =
        toNumber(
          summaryRow
            ?.operation_downtime,
        );

      const maintenanceDowntimeMinutes =
        toNumber(
          summaryRow
            ?.maintenance_downtime,
        );

      const unclassifiedDowntimeMinutes =
        toNumber(
          summaryRow
            ?.unclassified_downtime,
        );

      const totalDowntimeMinutes =
        operationDowntimeMinutes +
        maintenanceDowntimeMinutes +
        unclassifiedDowntimeMinutes;

      const timeline =
        timelineRows.map(
          (
            row,
          ) => {
            const rowTotal =
              toNumber(
                row.total,
              );

            const rowOperation =
              toNumber(
                row.operation_count,
              );

            const rowMaintenance =
              toNumber(
                row.maintenance_count,
              );

            const rowUnclassified =
              toNumber(
                row.unclassified_count,
              );

            const rowReviewed =
              toNumber(
                row.reviewed_count,
              );

            return {
              period:
                formatDate(
                  row.period,
                ),

              total:
                rowTotal,

              operation:
                rowOperation,

              maintenance:
                rowMaintenance,

              unclassified:
                rowUnclassified,

              reviewed:
                rowReviewed,

              downtimeMinutes:
                toNumber(
                  row.downtime_minutes,
                ),

              operationPercentage:
                percentage(
                  rowOperation,
                  rowTotal,
                ),

              maintenancePercentage:
                percentage(
                  rowMaintenance,
                  rowTotal,
                ),

              unclassifiedPercentage:
                percentage(
                  rowUnclassified,
                  rowTotal,
                ),
            };
          },
        );

      const byLine =
        lineRows.map(
          (
            row,
          ) => {
            const lineTotal =
              toNumber(
                row.total,
              );

            const lineOperation =
              toNumber(
                row.operation_count,
              );

            const lineMaintenance =
              toNumber(
                row.maintenance_count,
              );

            const lineUnclassified =
              toNumber(
                row.unclassified_count,
              );

            return {
              line:
                row.line_name?.trim() ||
                "Linha não informada",

              total:
                lineTotal,

              operation:
                lineOperation,

              maintenance:
                lineMaintenance,

              unclassified:
                lineUnclassified,

              reviewed:
                toNumber(
                  row.reviewed_count,
                ),

              downtimeMinutes:
                toNumber(
                  row.downtime_minutes,
                ),

              operationDowntimeMinutes:
                toNumber(
                  row.operation_downtime,
                ),

              maintenanceDowntimeMinutes:
                toNumber(
                  row.maintenance_downtime,
                ),

              unclassifiedDowntimeMinutes:
                toNumber(
                  row.unclassified_downtime,
                ),

              operationPercentage:
                percentage(
                  lineOperation,
                  lineTotal,
                ),

              maintenancePercentage:
                percentage(
                  lineMaintenance,
                  lineTotal,
                ),

              unclassifiedPercentage:
                percentage(
                  lineUnclassified,
                  lineTotal,
                ),
            };
          },
        );

      return NextResponse.json({
        success:
          true,

        editable:
          session.role ===
          "ANALISTA",

        view:
          "SUMMARY",

        filter: {
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

          selectedUnitIds:
            unitSelection
              .selectedUnitIds,
        },

        summary: {
          total,

          classified,

          operation,

          maintenance,

          unclassified,

          reviewed,

          modelOnly,

          operationPercentage:
            percentage(
              operation,
              classified,
            ),

          maintenancePercentage:
            percentage(
              maintenance,
              classified,
            ),

          unclassifiedPercentage:
            percentage(
              unclassified,
              total,
            ),

          reviewedPercentage:
            percentage(
              reviewed,
              total,
            ),

          modelOnlyPercentage:
            percentage(
              modelOnly,
              total,
            ),

          downtimeMinutes:
            totalDowntimeMinutes,

          operationDowntimeMinutes,

          maintenanceDowntimeMinutes,

          unclassifiedDowntimeMinutes,

          operationDowntimePercentage:
            percentage(
              operationDowntimeMinutes,
              totalDowntimeMinutes,
            ),

          maintenanceDowntimePercentage:
            percentage(
              maintenanceDowntimeMinutes,
              totalDowntimeMinutes,
            ),

          unclassifiedDowntimePercentage:
            percentage(
              unclassifiedDowntimeMinutes,
              totalDowntimeMinutes,
            ),
        },

        timeline,

        byLine,
      });
    }

    /* =====================================================
       VIEW = EVENTS

       A partir daqui o comportamento anterior é mantido.
    ====================================================== */

    const resultWhere:
      string[] = [
        "1 = 1",
      ];

    const resultValues:
      Array<
        string | number
      > = [];

    if (
      requestedOrigin
    ) {
      resultWhere.push(
        "origin_base.effective_origin = ?",
      );

      resultValues.push(
        requestedOrigin,
      );
    }

    if (
      search
    ) {
      resultWhere.push(
        `
          (
            COALESCE(
              origin_base.source_line_name,
              ''
            ) LIKE ?

            OR COALESCE(
              origin_base.source_equipment_name,
              ''
            ) LIKE ?

            OR COALESCE(
              origin_base.source_stop_type,
              ''
            ) LIKE ?

            OR COALESCE(
              origin_base.source_stop_subkey,
              ''
            ) LIKE ?

            OR COALESCE(
              origin_base.source_stop_key_1,
              ''
            ) LIKE ?

            OR COALESCE(
              origin_base.observation,
              ''
            ) LIKE ?
          )
        `,
      );

      const like =
        containsLikePattern(search);

      resultValues.push(
        like,
        like,
        like,
        like,
        like,
        like,
      );
    }

    /* =====================================================
       CONTAGEM
    ====================================================== */

    const countRows =
      await executeRows<
        CountRow[]
      >(
        `
          ${baseSql}

          SELECT
            COUNT(*)
              AS total

          FROM
            origin_base

          WHERE
            ${resultWhere.join(
              "\nAND ",
            )}
        `,
        [
          ...baseValues,
          ...resultValues,
        ],
      );

    const total =
      toNumber(
        countRows[
          0
        ]?.total ??
          0,
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total /
          pageSize,
        ),
      );

    const safePage =
      Math.min(
        page,
        totalPages,
      );

    const offset =
      (
        safePage -
        1
      ) *
      pageSize;

    /* =====================================================
       LISTA
    ====================================================== */

    const rows =
      await executeRows<
        OriginEventRow[]
      >(
        `
          ${baseSql}

          SELECT
            origin_base.id,

            origin_base.event_date,

            origin_base.source_line_name,

            origin_base.source_equipment_name,

            origin_base.source_stop_type,

            origin_base.source_stop_subkey,

            origin_base.source_stop_key_1,

            origin_base.observation,

            origin_base.downtime_minutes,

            origin_base.predicted_origin,

            origin_base.prediction_confidence,

            origin_base.prediction_confidence_level,

            origin_base.model_version,

            origin_base.manual_origin,

            origin_base.review_note,

            origin_base.reviewed_at,

            origin_base.reviewed_by_user_id,

            origin_base.reviewed_by_name,

            origin_base.effective_origin

          FROM
            origin_base

          WHERE
            ${resultWhere.join(
              "\nAND ",
            )}

          ORDER BY
            origin_base.event_date DESC,
            origin_base.id DESC

          LIMIT ?

          OFFSET ?
        `,
        [
          ...baseValues,
          ...resultValues,

          pageSize,

          offset,
        ],
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    const items =
      rows.map(
        (
          row,
        ) => {
          const predictedOrigin =
            normalizeOrigin(
              row.predicted_origin,
            );

          const manualOrigin =
            normalizeOrigin(
              row.manual_origin,
            );

          const effectiveOrigin =
            normalizeEffectiveOrigin(
              row.effective_origin,
            );

          return {
            id:
              Number(
                row.id,
              ),

            eventDate:
              formatDate(
                row.event_date,
              ),

            line:
              row.source_line_name,

            equipment:
              row.source_equipment_name,

            stopType:
              row.source_stop_type,

            stopSubkey:
              row.source_stop_subkey,

            stopKey:
              row.source_stop_key_1,

            observation:
              row.observation,

            downtimeMinutes:
              toNumber(
                row.downtime_minutes,
              ),

            prediction: {
              origin:
                predictedOrigin,

              confidence:
                row.prediction_confidence ===
                  null
                  ? null
                  : toNumber(
                      row.prediction_confidence,
                    ),

              confidenceLevel:
                row.prediction_confidence_level,

              modelVersion:
                row.model_version,
            },

            review: {
              manualOrigin,

              note:
                row.review_note,

              reviewedAt:
                formatDateTime(
                  row.reviewed_at,
                ),

              reviewedByUserId:
                row.reviewed_by_user_id,

              reviewedByName:
                row.reviewed_by_name,
            },

            effectiveOrigin:
              effectiveOrigin ===
              "NAO_CLASSIFICADO"
                ? null
                : effectiveOrigin,

            wasReviewed:
              manualOrigin !==
              null,
          };
        },
      );

    return NextResponse.json({
      success:
        true,

      editable:
        session.role ===
        "MAINTENANCE",

      view:
        "EVENTS",

      filter: {
        origin:
          requestedOrigin,

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

        search:
          search ||
          null,
      },

      pagination: {
        page:
          safePage,

        pageSize,

        total,

        totalPages,
      },

      items,
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/analytics/reliability/origins",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar as classificações de origem.",
      },
      {
        status:
          500,
      },
    );
  }
}

/* =========================================================
   PATCH

   MAINTENANCE:
   - cria revisão;
   - altera revisão;
   - remove revisão.

   MANAGER:
   - somente leitura.
========================================================= */

export async function PATCH(
  request: NextRequest,
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

  if (
    session.role !==
    "MAINTENANCE"
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Somente analistas podem revisar a origem das falhas.",
      },
      {
        status:
          403,
      },
    );
  }

  let body:
    PatchBody;

  try {
    body =
      await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Payload inválido.",
      },
      {
        status:
          400,
      },
    );
  }

  const eventId =
    Number(
      body.eventId,
    );

  if (
    !Number.isInteger(
      eventId,
    ) ||
    eventId <=
      0
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Evento inválido.",
      },
      {
        status:
          400,
      },
    );
  }

  const removeReview =
    body.manualOrigin ===
    null;

  const manualOrigin =
    removeReview
      ? null
      : normalizeOrigin(
          body.manualOrigin,
        );

  if (
    !removeReview &&
    !manualOrigin
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "A origem deve ser OPERACAO ou MANUTENCAO.",
      },
      {
        status:
          400,
      },
    );
  }

  const note =
    normalizeNote(
      body.note,
    );

  let connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    > |
    null =
    null;

  try {
    /* =====================================================
       GARANTIR QUE O EVENTO ESTÁ EM UMA UNIDADE AUTORIZADA
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

    const eventRows =
      await executeRows<
        EventAccessRow[]
      >(
        `
          SELECT
            e.id,
            e.unit_id

          FROM
            maintenance_events e

          WHERE
            e.id = ?

            AND e.unit_id IN (
              ${unitFilter.placeholders}
            )

          LIMIT 1
        `,
        [
          eventId,

          ...unitFilter.values,
        ],
      );

    if (
      eventRows.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Evento não encontrado ou fora das unidades autorizadas.",
        },
        {
          status:
            404,
        },
      );
    }

    /* =====================================================
       TRANSAÇÃO
    ====================================================== */

    connection =
      await getConnection();

    await connection
      .beginTransaction();

    const [
      currentRows,
    ] =
      await connection
        .query<
          CurrentReviewRow[]
        >(
          `
            SELECT
              id,

              manual_origin,

              review_note

            FROM
              event_failure_origin_reviews

            WHERE
              event_id = ?

            LIMIT 1

            FOR UPDATE
          `,
          [
            eventId,
          ],
        );

    const current =
      currentRows[
        0
      ];

    /* =====================================================
       RESTAURAR PREVISÃO
    ====================================================== */

    if (
      removeReview
    ) {
      if (
        current
      ) {
        await connection
          .query<
            ResultSetHeader
          >(
            `
              DELETE FROM
                event_failure_origin_reviews

              WHERE
                event_id = ?
            `,
            [
              eventId,
            ],
          );

        await connection
          .query<
            ResultSetHeader
          >(
            `
              INSERT INTO
                event_failure_origin_review_audit
              (
                event_id,

                user_id,

                previous_origin,

                new_origin,

                action,

                notes
              )

              VALUES
              (
                ?,
                ?,
                ?,
                NULL,
                'REMOCAO',
                ?
              )
            `,
            [
              eventId,

              session.userId,

              current.manual_origin,

              note,
            ],
          );
      }

      await connection
        .commit();

      return NextResponse.json({
        success:
          true,

        eventId,

        manualOrigin:
          null,

        restoredModelPrediction:
          true,
      });
    }

    /* =====================================================
       CRIAR OU ALTERAR REVISÃO
    ====================================================== */

    const action =
      current
        ? "ALTERACAO"
        : "CRIACAO";

    await connection
      .query<
        ResultSetHeader
      >(
        `
          INSERT INTO
            event_failure_origin_reviews
          (
            event_id,

            manual_origin,

            reviewed_by_user_id,

            review_note,

            reviewed_at
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            NOW()
          )

          ON DUPLICATE KEY UPDATE

            manual_origin =
              VALUES(
                manual_origin
              ),

            reviewed_by_user_id =
              VALUES(
                reviewed_by_user_id
              ),

            review_note =
              VALUES(
                review_note
              ),

            reviewed_at =
              NOW()
        `,
        [
          eventId,

          manualOrigin,

          session.userId,

          note,
        ],
      );

    /* =====================================================
       AUDITORIA
    ====================================================== */

    await connection
      .query<
        ResultSetHeader
      >(
        `
          INSERT INTO
            event_failure_origin_review_audit
          (
            event_id,

            user_id,

            previous_origin,

            new_origin,

            action,

            notes
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          eventId,

          session.userId,

          current
            ?.manual_origin ??
            null,

          manualOrigin,

          action,

          note,
        ],
      );

    await connection
      .commit();

    return NextResponse.json({
      success:
        true,

      eventId,

      manualOrigin,

      action,
    });
  } catch (
    error
  ) {
    if (
      connection
    ) {
      try {
        await connection
          .rollback();
      } catch {
        // Rollback já não era possível.
      }
    }

    console.error(
      "PATCH /api/analytics/reliability/origins",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível salvar a revisão da origem.",
      },
      {
        status:
          500,
      },
    );
  } finally {
    if (
      connection
    ) {
      connection
        .release();
    }
  }
}