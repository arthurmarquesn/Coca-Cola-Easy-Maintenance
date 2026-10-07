
// FILE: src/lib/ml/classify-import.ts

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
  type MlBatchPrediction,
} from "@/lib/ml/client";

/* =========================================================
   TYPES
========================================================= */

interface MaintenanceEventRow
  extends RowDataPacket {
  id:
    number;

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

  needs_component_classification:
    number | string | boolean;
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

  originModelVersion:
    string | null;

  eligible:
    number;

  processed:
    number;

  inserted:
    number;

  failed:
    number;

  /*
   * Mantidos por compatibilidade com consumidores antigos.
   *
   * Na política atual do Ursus estes valores devem
   * permanecer em zero.
   */
  highConfidence:
    number;

  reviewRequired:
    number;

  ruleHighConfidence:
    number;

  originProcessed:
    number;

  originHighConfidence:
    number;

  originMediumConfidence:
    number;

  originLowConfidence:
    number;

  status:
    | "COMPLETED"
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

  /*
   * Predições já obtidas, indexadas pelo texto enviado ao
   * modelo. Compartilhe o mesmo Map entre as unidades de uma
   * importação para não reclassificar apontamentos repetidos.
   */
  predictionCache?:
    MlPredictionCache;

  /*
   * Chamado ao fim de cada lote com quantos eventos ele
   * tinha, com sucesso ou falha.
   */
  onBatchDone?:
    (
      events: number,
    ) => void;
}

export type MlPredictionCache =
  Map<
    string,
    MlBatchPrediction
  >;

type MlHealthResult =
  Awaited<
    ReturnType<
      typeof getMlHealth
    >
  >;

interface ExtendedMlHealth {
  classifierVersion?:
    string | null;

  classifier_version?:
    string | null;

  model_version?:
    string | null;
}

type DecisionSource =
  | "ML"
  | "RULE";

type AutomationStatus =
  | "HIGH_CONFIDENCE"
  | "REVIEW_REQUIRED"
  | "RULE_HIGH_CONFIDENCE";

interface PredictionMetadata {
  decisionSource:
    DecisionSource | null;

  decisionMargin:
    number | null;

  automationThreshold:
    number | null;

  automationStatus:
    AutomationStatus | null;

  confidenceType:
    string | null;
}

type UnknownRecord =
  Record<
    string,
    unknown
  >;

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

/*
 * Lotes em andamento ao mesmo tempo: enquanto um lote
 * espera o modelo, os anteriores gravam no banco. As
 * chamadas ao modelo continuam uma por vez (ver mlQueue).
 */
const MAX_CONCURRENT_BATCHES =
  3;

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

/* =========================================================
   HELPERS
========================================================= */

function asRecord(
  value:
    unknown,
): UnknownRecord {
  if (
    value &&
    typeof value ===
      "object"
  ) {
    return value as
      UnknownRecord;
  }

  return {};
}

function stringOrNull(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return (
    cleaned ||
    null
  );
}

function finiteNumberOrNull(
  value:
    unknown,
): number | null {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function normalizeMysqlBoolean(
  value:
    number | string | boolean,
): boolean {
  if (
    value ===
      true ||
    value ===
      1 ||
    value ===
      "1"
  ) {
    return true;
  }

  if (
    value ===
      false ||
    value ===
      0 ||
    value ===
      "0"
  ) {
    return false;
  }

  throw new Error(
    "Valor inválido em needs_component_classification.",
  );
}

function fieldValue(
  record:
    UnknownRecord,

  camelCase:
    string,

  snakeCase:
    string,
): unknown {
  if (
    record[
      camelCase
    ] !== undefined
  ) {
    return record[
      camelCase
    ];
  }

  return record[
    snakeCase
  ];
}

/* =========================================================
   CACHE DE PREDIÇÕES
========================================================= */

/*
 * O modelo só recebe estes campos, então eventos com os
 * mesmos valores recebem a mesma predição.
 */
function predictionKey(
  event:
    MaintenanceEventRow,
): string {
  return JSON.stringify([
    event.observation,
    event.source_equipment_name,
    event.source_stop_key_1,
    event.source_stop_subkey,
    event.source_stop_type,
  ]);
}

async function predictWithCache(
  events:
    MaintenanceEventRow[],

  cache:
    MlPredictionCache,
): Promise<
  MlBatchPrediction[]
> {
  const keys =
    events.map(
      predictionKey,
    );

  const missing =
    new Map<
      string,
      MaintenanceEventRow
    >();

  keys.forEach(
    (
      key,
      index,
    ) => {
      if (
        !cache.has(key) &&
        !missing.has(key)
      ) {
        missing.set(
          key,
          events[index],
        );
      }
    },
  );

  if (
    missing.size >
    0
  ) {
    const predictions =
      await predictFailuresBatch(
        Array.from(
          missing.values(),
        ).map(
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

    const predictionByEventId =
      new Map(
        predictions.map(
          (
            prediction,
          ) => [
            prediction.eventId,
            prediction,
          ],
        ),
      );

    for (
      const [
        key,
        event,
      ]
      of missing
    ) {
      const prediction =
        predictionByEventId.get(
          event.id,
        );

      if (
        !prediction
      ) {
        throw new Error(
          `O serviço de classificação não retornou predição para o evento ${event.id}.`,
        );
      }

      cache.set(
        key,
        prediction,
      );
    }
  }

  return events.map(
    (
      event,
      index,
    ) => ({
      ...cache.get(
        keys[index],
      )!,

      eventId:
        event.id,
    }),
  );
}

/* =========================================================
   HEALTH / CLASSIFIER VERSION
========================================================= */

function getClassifierVersionFromHealth(
  health:
    MlHealthResult,
): string | null {
  const extendedHealth =
    health as
      MlHealthResult &
      ExtendedMlHealth;

  const camelCase =
    stringOrNull(
      extendedHealth
        .classifierVersion,
    );

  if (
    camelCase
  ) {
    return camelCase;
  }

  const snakeCase =
    stringOrNull(
      extendedHealth
        .classifier_version,
    );

  return snakeCase;
}

function getBaseModelVersion(
  health:
    MlHealthResult,
): string | null {
  const modelVersion =
    stringOrNull(
      health.modelVersion,
    );

  if (
    modelVersion
  ) {
    return modelVersion;
  }

  const extendedHealth =
    health as
      MlHealthResult &
      ExtendedMlHealth;

  return stringOrNull(
    extendedHealth
      .model_version,
  );
}

/* =========================================================
   PREDICTION METADATA
========================================================= */

function normalizeDecisionSource(
  value:
    unknown,
): DecisionSource | null {
  const normalized =
    stringOrNull(
      value,
    )?.toUpperCase();

  if (
    normalized ===
      "ML" ||
    normalized ===
      "RULE"
  ) {
    return normalized;
  }

  return null;
}

function normalizeAutomationStatus(
  value:
    unknown,
): AutomationStatus | null {
  const normalized =
    stringOrNull(
      value,
    )?.toUpperCase();

  if (
    normalized ===
      "HIGH_CONFIDENCE" ||
    normalized ===
      "REVIEW_REQUIRED" ||
    normalized ===
      "RULE_HIGH_CONFIDENCE"
  ) {
    return normalized;
  }

  return null;
}

function extractPredictionMetadata(
  prediction:
    unknown,
): PredictionMetadata {
  const record =
    asRecord(
      prediction,
    );

  const decisionSource =
    normalizeDecisionSource(
      fieldValue(
        record,
        "decisionSource",
        "decision_source",
      ),
    );

  const decisionMargin =
    finiteNumberOrNull(
      fieldValue(
        record,
        "decisionMargin",
        "decision_margin",
      ),
    );

  const automationThreshold =
    finiteNumberOrNull(
      fieldValue(
        record,
        "automationThreshold",
        "automation_threshold",
      ),
    );

  const automationStatus =
    normalizeAutomationStatus(
      fieldValue(
        record,
        "automationStatus",
        "automation_status",
      ),
    );

  const confidenceType =
    stringOrNull(
      fieldValue(
        record,
        "confidenceType",
        "confidence_type",
      ),
    );

  return {
    decisionSource,
    decisionMargin,
    automationThreshold,
    automationStatus,
    confidenceType,
  };
}

/* =========================================================
   MAIN
========================================================= */

export async function classifyImportWithMl({
  importId,
  unitId,
  batchSize,
  predictionCache =
    new Map(),
  onBatchDone,
}: ClassifyImportOptions):
Promise<ClassifyImportMlResult> {
  /* -------------------------------------------------------
     1. HEALTH
  ------------------------------------------------------- */

  const health =
    await getMlHealth();

  if (
    !health.available
  ) {
    return {
      available:
        false,

      modelVersion:
        null,

      originModelVersion:
        null,

      eligible:
        0,

      processed:
        0,

      inserted:
        0,

      failed:
        0,

      highConfidence:
        0,

      reviewRequired:
        0,

      ruleHighConfidence:
        0,

      originProcessed:
        0,

      originHighConfidence:
        0,

      originMediumConfidence:
        0,

      originLowConfidence:
        0,

      status:
        "MODEL_OFFLINE",
    };
  }

  const classifierVersionFromHealth =
    getClassifierVersionFromHealth(
      health,
    );

  const baseModelVersion =
    getBaseModelVersion(
      health,
    );

  const originModelVersion =
    stringOrNull(
      health.originModelVersion,
    );

  if (
    !originModelVersion
  ) {
    throw new Error(
      "O serviço de classificação está disponível, mas não informou originModelVersion.",
    );
  }

  let effectiveModelVersion:
    string | null =
      classifierVersionFromHealth ??
      baseModelVersion;

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

  /*
   * Permanecem zerados na política atual.
   */
  const highConfidence =
    0;

  let reviewRequired =
    0;

  const ruleHighConfidence =
    0;

  let originProcessed =
    0;

  let originHighConfidence =
    0;

  let originMediumConfidence =
    0;

  let originLowConfidence =
    0;

  let lastEventId =
    0;

  /*
   * Se o client já expõe classifierVersion,
   * podemos evitar classificar novamente um evento
   * que já possui sugestão da versão atual.
   */
  const canFilterByClassifierVersion =
    Boolean(
      classifierVersionFromHealth,
    );


  /*
   * Evento com classificação oficial (APROVADA/CORRIGIDA,
   * de qualquer origem) não recebe nova sugestão: ela não
   * poderia ser revisada.
   */
  const componentClassificationNeededCondition =
    canFilterByClassifierVersion
      ? `
          (
              NOT EXISTS (
                  SELECT
                      1

                  FROM
                      event_classifications ec

                  WHERE
                      ec.event_id =
                          me.id

                      AND ec.status IN (
                          'APROVADA',
                          'CORRIGIDA'
                      )
              )

              AND NOT EXISTS (
                  SELECT
                      1

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
          )
        `
      : `
          NOT EXISTS (
              SELECT
                  1

              FROM
                  event_classifications ec

              WHERE
                  ec.event_id =
                      me.id

                  AND ec.status IN (
                      'APROVADA',
                      'CORRIGIDA'
                  )
          )
        `;

  const eligibilityCondition = `
    AND (
        NOT EXISTS (
            SELECT
                1

            FROM
                event_failure_origin_predictions eop

            WHERE
                eop.event_id =
                    me.id

                AND eop.model_version =
                    ?
        )

        OR

        ${componentClassificationNeededCondition}
    )
  `;

  /* =======================================================
     2. TOTAL ELEGÍVEL
  ======================================================= */

  {
    const connection =
      await getConnection();

    try {
      const values:
        Array<
          number | string
        > = [
          importId,
          unitId,
          originModelVersion,
        ];

      if (
        canFilterByClassifierVersion &&
        classifierVersionFromHealth
      ) {
        values.push(
          classifierVersionFromHealth,
        );
      }

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

                -- TRIM só remove espaços: texto só com tab ou
                -- quebra de linha seria recusado pelo serviço.
                AND me.observation REGEXP '[^[:space:]]'

                ${eligibilityCondition}
          `,
          values,
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

  /* =======================================================
     3. PROCESSAMENTO EM LOTES
  ======================================================= */

  const inFlight =
    new Set<
      Promise<void>
    >();

  /*
   * O serviço usa toda a CPU em cada lote; chamadas em
   * paralelo só disputam processador e ficam mais lentas.
   */
  let mlQueue:
    Promise<unknown> =
      Promise.resolve();

  while (
    true
  ) {
    const connection =
      await getConnection();

    let events:
      MaintenanceEventRow[] =
        [];

    try {
      const values:
        Array<
          number | string
        > = [];

      if (
        canFilterByClassifierVersion &&
        classifierVersionFromHealth
      ) {
        values.push(
          classifierVersionFromHealth,
        );
      }

      values.push(
        importId,
        unitId,
        lastEventId,
        originModelVersion,
      );

      if (
        canFilterByClassifierVersion &&
        classifierVersionFromHealth
      ) {
        values.push(
          classifierVersionFromHealth,
        );
      }

      values.push(
        limit,
      );

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

                ${componentClassificationNeededCondition}
                    AS needs_component_classification

            FROM
                maintenance_events me

            WHERE
                me.import_id = ?

                AND me.unit_id = ?

                AND me.id > ?

                AND me.observation
                    IS NOT NULL

                -- TRIM só remove espaços: texto só com tab ou
                -- quebra de linha seria recusado pelo serviço.
                AND me.observation REGEXP '[^[:space:]]'

                ${eligibilityCondition}

            ORDER BY
                me.id ASC

            LIMIT ?
          `,
          values,
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

    const task =
      processBatch(
        events,
      ).finally(
        () => {
          inFlight.delete(
            task,
          );

          onBatchDone?.(
            events.length,
          );
        },
      );

    inFlight.add(
      task,
    );

    if (
      inFlight.size >=
      MAX_CONCURRENT_BATCHES
    ) {
      await Promise.race(
        inFlight,
      );
    }
  }

  await Promise.all(
    inFlight,
  );

  /* =======================================================
     4. PREDIÇÃO E PERSISTÊNCIA DE UM LOTE

     Nunca rejeita: uma falha conta o lote em failed.
  ======================================================= */

  async function processBatch(
    events:
      MaintenanceEventRow[],
  ): Promise<void> {
    try {
      const prediction =
        mlQueue.then(
          () =>
            predictWithCache(
              events,
              predictionCache,
            ),
        );

      mlQueue =
        prediction.catch(
          () => undefined,
        );

      const predictions =
        await prediction;

      if (
        predictions.length !==
        events.length
      ) {
        throw new Error(
          "O serviço de classificação retornou "
          +
          `${predictions.length} resultado(s) `
          +
          `para ${events.length} evento(s).`,
        );
      }

      processed +=
        predictions.length;

      if (
        predictions.length ===
        0
      ) {
        return;
      }

      /* ===================================================
         5. VALIDAR VERSÃO
      =================================================== */

      const batchModelVersion =
        predictions[0]
          .modelVersion
          .trim();

      if (
        !batchModelVersion
      ) {
        throw new Error(
          "O serviço de classificação "
          +
          "não informou modelVersion.",
        );
      }

      const hasMixedVersions =
        predictions.some(
          (
            prediction,
          ) =>
            prediction
              .modelVersion
              .trim() !==
            batchModelVersion,
        );

      if (
        hasMixedVersions
      ) {
        throw new Error(
          "O serviço de classificação "
          +
          "retornou versões diferentes "
          +
          "no mesmo lote.",
        );
      }

      effectiveModelVersion =
        batchModelVersion;

      const batchOriginModelVersion =
        predictions[0]
          .failureOriginModelVersion
          .trim();

      if (
        !batchOriginModelVersion
      ) {
        throw new Error(
          "O serviço de classificação não informou failureOriginModelVersion.",
        );
      }

      const hasMixedOriginVersions =
        predictions.some(
          (
            prediction,
          ) =>
            prediction
              .failureOriginModelVersion
              .trim() !==
            batchOriginModelVersion,
        );

      if (
        hasMixedOriginVersions
      ) {
        throw new Error(
          "O serviço de classificação retornou versões de origem diferentes no mesmo lote.",
        );
      }

      if (
        batchOriginModelVersion !==
        originModelVersion
      ) {
        throw new Error(
          "A versão de origem retornada nas predições não coincide com originModelVersion do health.",
        );
      }

      const eventById =
        new Map(
          events.map(
            (
              event,
            ) => [
              event.id,
              event,
            ],
          ),
        );

      const componentPredictions =
        predictions.filter(
          (
            prediction,
          ) => {
            const event =
              eventById.get(
                prediction.eventId,
              );

            if (
              !event
            ) {
              throw new Error(
                `Predição retornada para event_id inesperado: ${prediction.eventId}.`,
              );
            }

            return normalizeMysqlBoolean(
              event
                .needs_component_classification,
            );
          },
        );

      /* ===================================================
         5.1 CONTADORES DE DECISÃO
      =================================================== */

      for (
        const prediction
        of componentPredictions
      ) {
        const metadata =
          extractPredictionMetadata(
            prediction,
          );

        /*
         * Política atual do Ursus:
         *
         * toda sugestão de componente/modo,
         * seja RULE ou ML, permanece pendente
         * de revisão humana.
         */
        if (
          metadata
            .automationStatus !==
          "REVIEW_REQUIRED"
        ) {
          throw new Error(
            "A importação recebeu uma sugestão sem REVIEW_REQUIRED.",
          );
        }

        reviewRequired +=
          1;
      }

      /* ===================================================
         6. PERSISTÊNCIA
      =================================================== */

      const insertConnection =
        await getConnection();
      let batchInserted = 0;

      try {
        await insertConnection
          .beginTransaction();

        /* -------------------------------------------------
           6.1 INSERIR SUGESTÕES
        ------------------------------------------------- */

        if (
          componentPredictions.length >
          0
        ) {
          const placeholders =
            componentPredictions
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
            of componentPredictions
          ) {
            const metadata =
              extractPredictionMetadata(
                prediction,
              );

            values.push(
              prediction.eventId,

              prediction
                .modelVersion,

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

              metadata
                .decisionSource,

              metadata
                .decisionMargin,

              metadata
                .automationThreshold,

              metadata
                .automationStatus,

              metadata
                .confidenceType,
            );
          }

          const [
            insertResult,
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

                      decision_source,

                      decision_margin,

                      automation_threshold,

                      automation_status,

                      confidence_type,

                      status
                  )

                  VALUES
                      ${placeholders}
                `,
                values,
              );


          batchInserted =
            insertResult
              .affectedRows;
        }

        /* -------------------------------------------------
           6.2 PERSISTIR ORIGEM DA FALHA
        ------------------------------------------------- */

        const originPlaceholders =
          predictions
            .map(
              () =>
                `(
                  ?,
                  ?,
                  ?,
                  ?,
                  ?
                )`,
            )
            .join(
              ",",
            );

        const originValues:
          unknown[] =
            [];

        for (
          const prediction
          of predictions
        ) {
          originValues.push(
            prediction.eventId,

            prediction
              .failureOrigin,

            prediction
              .failureOriginConfidence,

            prediction
              .failureOriginConfidenceLevel,

            prediction
              .failureOriginModelVersion,
          );
        }

        await insertConnection
          .query<
            ResultSetHeader
          >(
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
                  ${originPlaceholders}

              ON DUPLICATE KEY UPDATE
                  failure_origin =
                      VALUES(failure_origin),

                  confidence =
                      VALUES(confidence),

                  confidence_level =
                      VALUES(confidence_level)
            `,
            originValues,
          );

        /* -------------------------------------------------
           6.3 DESCARTAR SUGESTÕES ANTIGAS

           Só descartamos sugestões ainda pendentes.

           CONFIRMADA e CORRIGIDA continuam preservadas.
        ------------------------------------------------- */

        const eventIds =
          componentPredictions.map(
            (
              prediction,
            ) =>
              prediction.eventId,
          );

        if (
          eventIds.length >
          0
        ) {
          const eventPlaceholders =
            eventIds
              .map(
                () => "?",
              )
              .join(
                ",",
              );

          await insertConnection
            .query<
              ResultSetHeader
            >(
              `
                UPDATE
                    classification_suggestions

                SET
                    status =
                        'DESCARTADA'

                WHERE
                    model_type =
                        'ML'

                    AND status =
                        'PENDENTE_REVISAO'

                    AND event_id IN (
                        ${eventPlaceholders}
                    )

                    AND model_version <> ?
              `,
              [
                ...eventIds,
                batchModelVersion,
              ],
            );
        }

        await insertConnection
          .commit();
        inserted += batchInserted;

        originProcessed +=
          predictions.length;

        for (
          const prediction
          of predictions
        ) {
          if (
            prediction
              .failureOriginConfidenceLevel ===
            "HIGH"
          ) {
            originHighConfidence +=
              1;
          }

          if (
            prediction
              .failureOriginConfidenceLevel ===
            "MEDIUM"
          ) {
            originMediumConfidence +=
              1;
          }

          if (
            prediction
              .failureOriginConfidenceLevel ===
            "LOW"
          ) {
            originLowConfidence +=
              1;
          }
        }
      } catch (
        persistenceError
      ) {
        await insertConnection
          .rollback();

        throw persistenceError;
      } finally {
        insertConnection
          .release();
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

  /* =======================================================
     7. RESULTADO
  ======================================================= */

  return {
    available:
      true,

    modelVersion:
      effectiveModelVersion,

    originModelVersion,

    eligible,

    processed,

    inserted,

    failed,

    highConfidence,

    reviewRequired,

    ruleHighConfidence,

    originProcessed,

    originHighConfidence,

    originMediumConfidence,

    originLowConfidence,

    status:
      failed >
      0
        ? "PARTIAL"
        : "COMPLETED",
  };
}