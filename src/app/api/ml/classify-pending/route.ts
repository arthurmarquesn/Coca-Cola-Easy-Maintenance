import { getWriteAccessError } from "@/lib/write-access";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import {
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  getMlHealth,
  predictFailuresBatch,
} from "@/lib/ml/client";

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";


interface RequestBody {
  limit?: unknown;
}


interface MaintenanceEventRow
  extends RowDataPacket {
  id: number;

  observation: string | null;

  source_equipment_name:
    string | null;

  source_stop_key_1:
    string | null;

  source_stop_subkey:
    string | null;

  source_stop_type:
    string | null;

  source_line_name:
    string | null;
}


function normalizeLimit(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 20;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(value),
      100,
    ),
  );
}


export async function POST(
  request: NextRequest,
) {
  const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;
  if (!session) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 },
    );
  }

  let body: RequestBody = {};

  try {
    body =
      (await request.json()) as
        RequestBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    body = {};
  }

  const limit =
    normalizeLimit(
      body.limit,
    );

  const health =
    await getMlHealth();

  if (
    !health.available ||
    !health.modelVersion
  ) {
    return NextResponse.json(
      {
        error:
          "Modelo ML indisponível.",
      },
      {
        status: 503,
      },
    );
  }

  const modelVersion =
    health.modelVersion;

  const { selectedUnitIds } =
    await getUnitSelection({
      userId: session.userId,
      defaultUnitId: session.unitId,
    });

  if (selectedUnitIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhuma unidade válida está selecionada.",
      },
      {
        status: 403,
      },
    );
  }

  const unitClause =
    buildUnitInClause(
      selectedUnitIds,
    );

  const connection =
    await getConnection();

  try {
    const [
      rows,
    ] =
      await connection.query<
        MaintenanceEventRow[]
      >(
        `
          SELECT
              me.id,
              me.observation,
              me.source_equipment_name,
              me.source_stop_key_1,
              me.source_stop_subkey,
              me.source_stop_type,
              me.source_line_name
          FROM maintenance_events me

          WHERE
              me.unit_id IN (${unitClause.placeholders})

              AND me.observation IS NOT NULL

              AND me.observation REGEXP '[^[:space:]]'

              /* Só eventos que nunca receberam sugestão. Filtrar
                 pela versão do /health não funcionava: a sugestão
                 é gravada com a versão do classificador combinado
                 (RULES+ml-...), então os mesmos eventos voltavam
                 a cada chamada. Reclassificar após troca de modelo
                 é papel de /api/imports/classify. */
              AND NOT EXISTS (
                  SELECT 1
                  FROM classification_suggestions cs

                  WHERE
                      cs.event_id = me.id

                      AND cs.model_type = 'ML'
              )

              AND NOT EXISTS (
                  SELECT 1
                  FROM event_classifications ec

                  WHERE
                      ec.event_id = me.id

                      AND ec.status IN ('APROVADA', 'CORRIGIDA')
              )

          ORDER BY
              me.event_date ASC,
              me.id ASC

          LIMIT ?
        `,
        [
          ...unitClause.values,
          limit,
        ],
      );

    /*
     * Mesmo contrato de gravação de lib/ml/classify-import:
     * metadados da decisão (fonte, margem, status de
     * automação) e a origem da falha. Antes esta rota gravava
     * só componente/modo, e os eventos ficavam sem origem
     * (Operação x Manutenção) para sempre, pois não voltam a
     * ser selecionados depois de receber a sugestão.
     */
    const processed =
      rows.length;

    let inserted = 0;

    let failed = 0;

    const failures: Array<{
      eventId: number;
      error: string;
    }> = [];

    if (rows.length > 0) {
      try {
        const predictions =
          await predictFailuresBatch(
            rows.map(
              (event) => ({
                eventId:
                  event.id,

                observation:
                  event.observation ?? "",

                equipment:
                  event.source_equipment_name,

                stopKey1:
                  event.source_stop_key_1,

                stopSubkey:
                  event.source_stop_subkey,

                stopType:
                  event.source_stop_type,

                line:
                  event.source_line_name,
              }),
            ),
          );

        await connection.beginTransaction();

        const [
          suggestionResult,
        ] =
          await connection.query<ResultSetHeader>(
            `
              INSERT IGNORE INTO
                  classification_suggestions
              (
                  event_id,
                  model_type,
                  model_version,
                  failed_component_code,
                  failure_mode,
                  confidence,
                  top_predictions,
                  decision_source,
                  decision_margin,
                  automation_threshold,
                  automation_status,
                  confidence_type,
                  status
              )
              VALUES
                  ${predictions
                    .map(() => "(?, 'ML', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE_REVISAO')")
                    .join(", ")}
            `,
            predictions.flatMap(
              (prediction) => [
                prediction.eventId,
                prediction.modelVersion,
                prediction.failedComponentCode,
                prediction.failureMode,
                prediction.confidence,
                JSON.stringify(
                  prediction.topPredictions,
                ),
                prediction.decisionSource,
                prediction.decisionMargin,
                prediction.automationThreshold,
                prediction.automationStatus,
                prediction.confidenceType,
              ],
            ),
          );

        await connection.query<ResultSetHeader>(
          `
            INSERT INTO
                event_failure_origin_predictions
            (
                event_id,
                failure_origin,
                confidence,
                confidence_level,
                model_version
            )
            VALUES
                ${predictions
                  .map(() => "(?, ?, ?, ?, ?)")
                  .join(", ")}
            ON DUPLICATE KEY UPDATE
                failure_origin =
                    VALUES(failure_origin),
                confidence =
                    VALUES(confidence),
                confidence_level =
                    VALUES(confidence_level)
          `,
          predictions.flatMap(
            (prediction) => [
              prediction.eventId,
              prediction.failureOrigin,
              prediction.failureOriginConfidence,
              prediction.failureOriginConfidenceLevel,
              prediction.failureOriginModelVersion,
            ],
          ),
        );

        await connection.commit();

        inserted =
          suggestionResult.affectedRows;
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // A transação pode não ter sido aberta.
        }

        failed =
          rows.length;

        for (const event of rows) {
          failures.push({
            eventId:
              event.id,

            error:
              "Não foi possível classificar o evento.",
          });
        }

        console.error(
          "Erro ao classificar eventos pendentes:",
          error,
        );
      }
    }

    return NextResponse.json({
      modelVersion,

      requestedLimit:
        limit,

      found:
        rows.length,

      processed,

      inserted,

      failed,

      failures,
    });
  } catch (error) {
    console.error(
      "Erro no processamento em lote do Modelo ML:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível processar os apontamentos.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}
