import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import {
  getConnection,
} from "@/lib/db";

import {
  getMlHealth,
  predictFailuresBatch,
} from "@/lib/ml/client";


interface MaintenanceEventRow
  extends RowDataPacket {
  id: number;

  observation:
    string;

  source_equipment_name:
    string | null;

  source_stop_key_1:
    string | null;

  source_stop_subkey:
    string | null;

  source_stop_type:
    string | null;
}


interface CountRow
  extends RowDataPacket {
  total:
    number | string;
}


export interface ClassifyImportMlResult {
  available:
    boolean;

  modelVersion:
    string | null;

  eligible:
    number;

  processed:
    number;

  inserted:
    number;

  failed:
    number;

  status:
    "COMPLETED"
    | "PARTIAL"
    | "MODEL_OFFLINE";
}


interface ClassifyImportOptions {
  importId:
    number;

  unitId:
    number;

  batchSize?:
    number;
}


function normalizeBatchSize(
  value:
    number | undefined,
): number {
  if (
    !value ||
    !Number.isFinite(
      value,
    )
  ) {
    return 250;
  }

  return Math.max(
    10,
    Math.min(
      Math.floor(
        value,
      ),
      500,
    ),
  );
}


export async function classifyImportWithMl({
  importId,
  unitId,
  batchSize,
}: ClassifyImportOptions):
Promise<ClassifyImportMlResult> {
  const health =
    await getMlHealth();

  if (
    !health.available ||
    !health.modelVersion
  ) {
    return {
      available:
        false,

      modelVersion:
        null,

      eligible:
        0,

      processed:
        0,

      inserted:
        0,

      failed:
        0,

      status:
        "MODEL_OFFLINE",
    };
  }

  const modelVersion =
    health.modelVersion;

  const limit =
    normalizeBatchSize(
      batchSize,
    );

  let eligible =
    0;

  let processed =
    0;

  let inserted =
    0;

  let failed =
    0;

  let lastEventId =
    0;


  /*
   * Total de eventos ainda sem
   * sugestão desta versão.
   */
  {
    const connection =
      await getConnection();

    try {
      const [
        rows,
      ] =
        await connection.query<
          CountRow[]
        >(
          `
            SELECT
                COUNT(*) AS total

            FROM
                maintenance_events me

            WHERE
                me.import_id = ?

                AND me.unit_id = ?

                AND me.observation
                    IS NOT NULL

                AND TRIM(
                    me.observation
                ) <> ''

                AND NOT EXISTS (
                    SELECT 1

                    FROM
                        classification_suggestions cs

                    WHERE
                        cs.event_id =
                            me.id

                        AND cs.model_type =
                            'ML'

                        AND cs.model_version =
                            ?
                )
          `,
          [
            importId,
            unitId,
            modelVersion,
          ],
        );

      eligible =
        Number(
          rows[0]?.total ??
          0,
        );
    } finally {
      connection.release();
    }
  }


  while (true) {
    const connection =
      await getConnection();

    let events:
      MaintenanceEventRow[] =
        [];

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

            FROM
                maintenance_events me

            WHERE
                me.import_id = ?

                AND me.unit_id = ?

                AND me.id > ?

                AND me.observation
                    IS NOT NULL

                AND TRIM(
                    me.observation
                ) <> ''

                AND NOT EXISTS (
                    SELECT 1

                    FROM
                        classification_suggestions cs

                    WHERE
                        cs.event_id =
                            me.id

                        AND cs.model_type =
                            'ML'

                        AND cs.model_version =
                            ?
                )

            ORDER BY
                me.id ASC

            LIMIT ?
          `,
          [
            importId,
            unitId,
            lastEventId,
            modelVersion,
            limit,
          ],
        );

      events =
        rows;
    } finally {
      connection.release();
    }


    if (
      events.length ===
      0
    ) {
      break;
    }


    lastEventId =
      events[
        events.length - 1
      ].id;


    try {
      const predictions =
        await predictFailuresBatch(
          events.map(
            (
              event,
            ) => ({
              eventId:
                event.id,

              observation:
                event.observation,

              equipment:
                event
                  .source_equipment_name,

              stopKey1:
                event
                  .source_stop_key_1,

              stopSubkey:
                event
                  .source_stop_subkey,

              stopType:
                event
                  .source_stop_type,
            }),
          ),
        );


      processed +=
        predictions.length;


      if (
        predictions.length >
        0
      ) {
        const insertConnection =
          await getConnection();

        try {
          const placeholders =
            predictions
              .map(
                () =>
                  `(
                    ?,
                    'ML',
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'PENDENTE_REVISAO'
                  )`,
              )
              .join(
                ",",
              );


          const values:
            unknown[] =
              [];

          for (
            const prediction
            of predictions
          ) {
            values.push(
              prediction.eventId,

              prediction.modelVersion,

              prediction
                .failedComponentCode,

              prediction
                .failureMode,

              prediction
                .confidence,

              JSON.stringify(
                prediction
                  .topPredictions,
              ),
            );
          }


          const [
            result,
          ] =
            await insertConnection
              .query<
                ResultSetHeader
              >(
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
                      ${placeholders}
                `,
                values,
              );


          inserted +=
            result
              .affectedRows;
        } finally {
          insertConnection
            .release();
        }
      }
    } catch (
      error
    ) {
      failed +=
        events.length;

      console.error(
        `Falha ao classificar lote da importação ${importId}:`,
        error,
      );
    }
  }


  return {
    available:
      true,

    modelVersion,

    eligible,

    processed,

    inserted,

    failed,

    status:
      failed > 0
        ? "PARTIAL"
        : "COMPLETED",
  };
}