import { getWriteAccessError } from "@/lib/write-access";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
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
  predictFailure,
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
              me.source_stop_type
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

    let processed = 0;

    let inserted = 0;

    let failed = 0;

    const failures: Array<{
      eventId: number;
      error: string;
    }> = [];

    for (
      const event
      of rows
    ) {
      processed += 1;

      try {
        const prediction =
          await predictFailure({
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
          });

        const [
          result,
        ] =
          await connection.execute(
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
                  status
              )
              VALUES
              (
                  ?,
                  'ML',
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  'PENDENTE_REVISAO'
              )
            `,
            [
              event.id,

              prediction.modelVersion,

              prediction.failedComponentCode,

              prediction.failureMode,

              prediction.confidence,

              JSON.stringify(
                prediction.topPredictions,
              ),
            ],
          );

        const mysqlResult =
          result as {
            affectedRows?: number;
          };

        if (
          mysqlResult.affectedRows === 1
        ) {
          inserted += 1;
        }
      } catch (error) {
        failed += 1;

        failures.push({
          eventId:
            event.id,

          error:
            "Não foi possível classificar o evento.",
        });

        console.error(
          `Erro ao classificar evento ${event.id}:`,
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
