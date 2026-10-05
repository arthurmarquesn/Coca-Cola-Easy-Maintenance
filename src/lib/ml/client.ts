// FILE: src/lib/ml/client.ts

/* =========================================================
   TYPES - DECISÃO
========================================================= */

export type MlDecisionSource =
  | "ML"
  | "RULE";

export type MlAutomationStatus =
  | "HIGH_CONFIDENCE"
  | "REVIEW_REQUIRED"
  | "RULE_HIGH_CONFIDENCE";

export type MlFailureOrigin =
  | "MANUTENCAO"
  | "OPERACAO";

export type MlFailureOriginConfidenceLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface MlRankedPrediction {
  failedComponentCode:
    string;

  failureMode:
    string;

  /*
   * Score legado entre 0 e 1.
   *
   * IMPORTANTE:
   * NÃO representa probabilidade calibrada.
   */
  confidence:
    number;

  /*
   * Score bruto da decision_function do LinearSVC.
   *
   * Para decisões geradas por regras pode ser null.
   */
  decisionScore:
    number | null;
}

/* =========================================================
   TYPES - PREDIÇÃO
========================================================= */

export interface MlPrediction {
  /*
   * Versão efetiva responsável pela decisão.
   *
   * Exemplo:
   *
   * rules-v1+ml-failure_classifier_real_v1_1_eval
   */
  modelVersion:
    string;

  failedComponentCode:
    string;

  failureMode:
    string;

  /*
   * Mantido por compatibilidade com a estrutura
   * existente do banco e da interface.
   *
   * Para o LinearSVC real, NÃO deve ser
   * interpretado como probabilidade.
   */
  confidence:
    number;

  topPredictions:
    MlRankedPrediction[];

  /*
   * Origem efetiva da decisão.
   */
  decisionSource:
    MlDecisionSource;

  /*
   * LinearSVC:
   *
   * score_top1 - score_top2
   *
   * Para RULE será null.
   */
  decisionMargin:
    number | null;

  /*
   * Threshold selecionado no benchmark para
   * classificar uma previsão como alta confiança.
   *
   * Para RULE será null.
   */
  automationThreshold:
    number | null;

  automationStatus:
    MlAutomationStatus;

  /*
   * Indica explicitamente se o sistema recomenda
   * revisão humana.
   */
  reviewRequired:
    boolean;

  /*
   * Exemplos:
   *
   * ranking_score_not_probability
   * rule_confidence
   */
  confidenceType:
    string;

  failureOrigin:
    MlFailureOrigin;

  failureOriginConfidence:
    number;

  failureOriginConfidenceLevel:
    MlFailureOriginConfidenceLevel;

  failureOriginModelVersion:
    string;
}

/* =========================================================
   TYPES - INPUT
========================================================= */

export interface MlPredictionInput {
  observation:
    string;

  equipment?:
    string | null;

  stopKey1?:
    string | null;

  stopSubkey?:
    string | null;

  stopType?:
    string | null;

  line?:
    string | null;
}

export interface MlBatchPredictionInput
  extends MlPredictionInput {
  eventId:
    number;
}

export interface MlBatchPrediction
  extends MlPrediction {
  eventId:
    number;
}

/* =========================================================
   TYPES - HEALTH
========================================================= */

export interface MlHealth {
  available:
    boolean;

  status:
    string;

  /*
   * Modelo ML puro.
   */
  modelVersion:
    string | null;

  /*
   * Camada de regras.
   */
  rulesVersion:
    string | null;

  /*
   * Versão efetiva.
   */
  classifierVersion:
    string | null;

  /*
   * Tipo de confiança utilizado pelo modelo.
   */
  confidenceType:
    string | null;

  /*
   * Threshold legado de alta confiança.
   *
   * Mantido apenas para compatibilidade e diagnóstico.
   * Não autoriza classificação automática.
   */
  highConfidenceThreshold:
    number | null;

  originModelVersion:
    string | null;

  originConfidenceType:
    string | null;

  originHighConfidenceThreshold:
    number | null;

  originMediumConfidenceThreshold:
    number | null;
}

/* =========================================================
   TYPES - API PYTHON
========================================================= */

interface MlApiRankedPrediction {
  failed_component_code:
    string;

  failure_mode:
    string;

  confidence:
    number;

  decision_score?:
    number | null;
}

interface MlApiPrediction {
  model_version:
    string;

  failed_component_code:
    string;

  failure_mode:
    string;

  confidence:
    number;

  top_predictions:
    MlApiRankedPrediction[];

  decision_source?:
    string;

  decision_margin?:
    number | null;

  automation_threshold?:
    number | null;

  automation_status?:
    string;

  review_required?:
    boolean;

  confidence_type?:
    string;

  failure_origin:
    string;

  failure_origin_confidence:
    number;

  failure_origin_confidence_level:
    string;

  failure_origin_model_version:
    string;
}

interface MlApiBatchPrediction
  extends MlApiPrediction {
  event_id:
    number;
}

interface MlApiBatchResponse {
  model_version:
    string;

  items:
    MlApiBatchPrediction[];
}

interface MlApiHealth {
  status:
    string;

  model_version:
    string;

  rules_version?:
    string;

  classifier_version?:
    string;

  confidence_type?:
    string;

  high_confidence_threshold?:
    number | null;

  origin_model_version?:
    string;

  origin_confidence_type?:
    string;

  origin_high_confidence_threshold?:
    number | null;

  origin_medium_confidence_threshold?:
    number | null;
}

/* =========================================================
   SERVICE URL
========================================================= */

function getMlServiceUrl():
string {
  const value =
    process.env
      .ML_SERVICE_URL
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      "ML_SERVICE_URL não configurado.",
    );
  }

  return value.replace(
    /\/+$/,
    "",
  );
}

/* =========================================================
   HELPERS
========================================================= */

function cleanString(
  value:
    unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function normalizeConfidence(
  value:
    unknown,
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      parsed,
      1,
    ),
  );
}

function nullableFiniteNumber(
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

function normalizeDecisionSource(
  value:
    unknown,
): MlDecisionSource | null {
  const normalized =
    cleanString(
      value,
    ).toUpperCase();

  if (
    normalized ===
      "ML"
  ) {
    return "ML";
  }

  if (
    normalized ===
      "RULE"
  ) {
    return "RULE";
  }

  return null;
}

function normalizeAutomationStatus(
  value:
    unknown,
): MlAutomationStatus | null {
  const normalized =
    cleanString(
      value,
    ).toUpperCase();

  if (
    normalized ===
      "HIGH_CONFIDENCE"
  ) {
    return "HIGH_CONFIDENCE";
  }

  if (
    normalized ===
      "REVIEW_REQUIRED"
  ) {
    return "REVIEW_REQUIRED";
  }

  if (
    normalized ===
      "RULE_HIGH_CONFIDENCE"
  ) {
    return "RULE_HIGH_CONFIDENCE";
  }

  return null;
}

function normalizeFailureOrigin(
  value:
    unknown,
): MlFailureOrigin {
  const normalized =
    cleanString(
      value,
    );

  if (
    normalized ===
      "MANUTENCAO" ||
    normalized ===
      "OPERACAO"
  ) {
    return normalized;
  }

  throw new Error(
    "O serviço de classificação não informou failure_origin válido.",
  );
}

function normalizeFailureOriginConfidenceLevel(
  value:
    unknown,
): MlFailureOriginConfidenceLevel {
  const normalized =
    cleanString(
      value,
    );

  if (
    normalized ===
      "LOW" ||
    normalized ===
      "MEDIUM" ||
    normalized ===
      "HIGH"
  ) {
    return normalized;
  }

  throw new Error(
    "O serviço de classificação não informou failure_origin_confidence_level válido.",
  );
}

function normalizeFailureOriginConfidence(
  value:
    unknown,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    ) ||
    value <
      0 ||
    value >
      1
  ) {
    throw new Error(
      "O serviço de classificação não informou failure_origin_confidence válido entre 0 e 1.",
    );
  }

  return value;
}

/* =========================================================
   MAP PREDICTION
========================================================= */

function mapPrediction(
  data:
    MlApiPrediction,
): MlPrediction {
  /* -------------------------------------------------------
     CAMPOS BÁSICOS
  ------------------------------------------------------- */

  const modelVersion =
    cleanString(
      data.model_version,
    );

  const failedComponentCode =
    cleanString(
      data
        .failed_component_code,
    );

  const failureMode =
    cleanString(
      data.failure_mode,
    );

  if (
    !modelVersion
  ) {
    throw new Error(
      "O serviço de classificação não informou model_version.",
    );
  }

  if (
    !failedComponentCode
  ) {
    throw new Error(
      "O serviço de classificação não informou failed_component_code.",
    );
  }

  if (
    !failureMode
  ) {
    throw new Error(
      "O serviço de classificação não informou failure_mode.",
    );
  }

  /* -------------------------------------------------------
     METADADOS DA DECISÃO
  ------------------------------------------------------- */

  const decisionSource =
    normalizeDecisionSource(
      data.decision_source,
    );

  if (
    !decisionSource
  ) {
    throw new Error(
      "O serviço de classificação não informou um decision_source válido.",
    );
  }

  const automationStatus =
    normalizeAutomationStatus(
      data.automation_status,
    );

  if (
    !automationStatus
  ) {
    throw new Error(
      "O serviço de classificação não informou um automation_status válido.",
    );
  }

  const confidenceType =
    cleanString(
      data.confidence_type,
    );

  if (
    !confidenceType
  ) {
    throw new Error(
      "O serviço de classificação não informou confidence_type.",
    );
  }

  if (
    typeof data
      .review_required !==
    "boolean"
  ) {
    throw new Error(
      "O serviço de classificação não informou review_required corretamente.",
    );
  }

  const decisionMargin =
    nullableFiniteNumber(
      data.decision_margin,
    );

  const automationThreshold =
    nullableFiniteNumber(
      data.automation_threshold,
    );

  /*
   * Para uma previsão realmente produzida pelo ML,
   * margem e threshold continuam obrigatórios.
   *
   * Eles são usados para auditoria/diagnóstico e não
   * autorizam classificação automática.
   */
  if (
    decisionSource ===
      "ML"
  ) {
    if (
      decisionMargin ===
      null
    ) {
      throw new Error(
        "A previsão ML não informou decision_margin.",
      );
    }

    if (
      automationThreshold ===
      null
    ) {
      throw new Error(
        "A previsão ML não informou automation_threshold.",
      );
    }
  }

  /*
   * =======================================================
   * POLÍTICA HUMAN-IN-THE-LOOP
   * =======================================================
   *
   * Toda decisão do Ursus, seja RULE ou ML,
   * deve obrigatoriamente passar por revisão humana.
   *
   * HIGH_CONFIDENCE e RULE_HIGH_CONFIDENCE continuam no
   * tipo apenas por compatibilidade histórica com registros
   * já persistidos, mas não são aceitos como resposta do
   * runtime atual.
   */
  if (
    automationStatus !==
      "REVIEW_REQUIRED"
  ) {
    throw new Error(
      "Toda decisão do Ursus deve possuir automation_status REVIEW_REQUIRED.",
    );
  }

  if (
    data.review_required !==
      true
  ) {
    throw new Error(
      "Toda decisão do Ursus deve possuir review_required=true.",
    );
  }

  /* -------------------------------------------------------
     ORIGEM DA FALHA
  ------------------------------------------------------- */

  const failureOrigin =
    normalizeFailureOrigin(
      data.failure_origin,
    );

  const failureOriginConfidence =
    normalizeFailureOriginConfidence(
      data
        .failure_origin_confidence,
    );

  const failureOriginConfidenceLevel =
    normalizeFailureOriginConfidenceLevel(
      data
        .failure_origin_confidence_level,
    );

  const failureOriginModelVersion =
    cleanString(
      data
        .failure_origin_model_version,
    );

  if (
    !failureOriginModelVersion
  ) {
    throw new Error(
      "O serviço de classificação não informou failure_origin_model_version.",
    );
  }

  /* -------------------------------------------------------
     TOP PREDICTIONS
  ------------------------------------------------------- */

  const topPredictions:
    MlRankedPrediction[] =
    Array.isArray(
      data.top_predictions,
    )
      ? data
          .top_predictions
          .map(
            (
              prediction,
            ): MlRankedPrediction => ({
              failedComponentCode:
                cleanString(
                  prediction
                    .failed_component_code,
                ),

              failureMode:
                cleanString(
                  prediction
                    .failure_mode,
                ),

              confidence:
                normalizeConfidence(
                  prediction
                    .confidence,
                ),

              decisionScore:
                nullableFiniteNumber(
                  prediction
                    .decision_score,
                ),
            }),
          )
          .filter(
            (
              prediction,
            ) =>
              Boolean(
                prediction
                  .failedComponentCode,
              ) &&
              Boolean(
                prediction
                  .failureMode,
              ),
          )
      : [];

  /* -------------------------------------------------------
     RESULTADO
  ------------------------------------------------------- */

  return {
    modelVersion,

    failedComponentCode,

    failureMode,

    confidence:
      normalizeConfidence(
        data.confidence,
      ),

    topPredictions,

    decisionSource,

    decisionMargin,

    automationThreshold,

    automationStatus,

    reviewRequired:
      data.review_required,

    confidenceType,

    failureOrigin,

    failureOriginConfidence,

    failureOriginConfidenceLevel,

    failureOriginModelVersion,
  };
}

/* =========================================================
   HEALTH
========================================================= */

export async function getMlHealth():
Promise<MlHealth> {
  try {
    const response =
      await fetch(
        `${getMlServiceUrl()}/health`,
        {
          signal: AbortSignal.timeout(5_000),
          cache:
            "no-store",
        },
      );

    if (
      !response.ok
    ) {
      return {
        available:
          false,

        status:
          "offline",

        modelVersion:
          null,

        rulesVersion:
          null,

        classifierVersion:
          null,

        confidenceType:
          null,

        highConfidenceThreshold:
          null,

        originModelVersion:
          null,

        originConfidenceType:
          null,

        originHighConfidenceThreshold:
          null,

        originMediumConfidenceThreshold:
          null,
      };
    }

    const data =
      (
        await response.json()
      ) as MlApiHealth;

    const status =
      cleanString(
        data.status,
      );

    const modelVersion =
      cleanString(
        data.model_version,
      );

    const rulesVersion =
      cleanString(
        data.rules_version,
      );

    const classifierVersion =
      cleanString(
        data.classifier_version,
      );

    const confidenceType =
      cleanString(
        data.confidence_type,
      );

    const highConfidenceThreshold =
      nullableFiniteNumber(
        data
          .high_confidence_threshold,
      );

    const originModelVersion =
      cleanString(
        data
          .origin_model_version,
      );

    const originConfidenceType =
      cleanString(
        data
          .origin_confidence_type,
      );

    const originHighConfidenceThreshold =
      nullableFiniteNumber(
        data
          .origin_high_confidence_threshold,
      );

    const originMediumConfidenceThreshold =
      nullableFiniteNumber(
        data
          .origin_medium_confidence_threshold,
      );

    return {
      available:
        status ===
        "ok",

      status:
        status ||
        "unknown",

      modelVersion:
        modelVersion ||
        null,

      rulesVersion:
        rulesVersion ||
        null,

      classifierVersion:
        classifierVersion ||
        null,

      confidenceType:
        confidenceType ||
        null,

      highConfidenceThreshold,

      originModelVersion:
        originModelVersion ||
        null,

      originConfidenceType:
        originConfidenceType ||
        null,

      originHighConfidenceThreshold,

      originMediumConfidenceThreshold,
    };
  } catch {
    return {
      available:
        false,

      status:
        "offline",

      modelVersion:
        null,

      rulesVersion:
        null,

      classifierVersion:
        null,

      confidenceType:
        null,

      highConfidenceThreshold:
        null,

      originModelVersion:
        null,

      originConfidenceType:
        null,

      originHighConfidenceThreshold:
        null,

      originMediumConfidenceThreshold:
        null,
    };
  }
}

/* =========================================================
   PREDICT - INDIVIDUAL
========================================================= */

/*
 * Limites do schema do FastAPI (ml/api/app.py). Um campo
 * maior faz o /predict-batch recusar o lote inteiro.
 */
const MAX_OBSERVATION_LENGTH = 5000;
const MAX_CONTEXT_LENGTH = 500;

function limitText(
  value: string | null | undefined,
  maxLength: number,
): string {
  return (value ?? "").trim().slice(0, maxLength);
}

export async function predictFailure(
  input:
    MlPredictionInput,
): Promise<MlPrediction> {
  const response =
    await fetch(
      `${getMlServiceUrl()}/predict`,
      {
        signal: AbortSignal.timeout(30_000),
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            observation:
              limitText(input.observation, MAX_OBSERVATION_LENGTH),

            equipment:
              limitText(input.equipment, MAX_CONTEXT_LENGTH),

            stop_key_1:
              limitText(input.stopKey1, MAX_CONTEXT_LENGTH),

            stop_subkey:
              limitText(input.stopSubkey, MAX_CONTEXT_LENGTH),

            stop_type:
              limitText(input.stopType, MAX_CONTEXT_LENGTH),

            line:
              limitText(input.line, MAX_CONTEXT_LENGTH),
          }),

        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    const text =
      await response.text();

    throw new Error(
      `Serviço de classificação respondeu ${response.status}: ${text}`,
    );
  }

  const data =
    (
      await response.json()
    ) as MlApiPrediction;

  return mapPrediction(
    data,
  );
}

/* =========================================================
   PREDICT - BATCH
========================================================= */

export async function predictFailuresBatch(
  items:
    MlBatchPredictionInput[],
): Promise<
  MlBatchPrediction[]
> {
  if (
    items.length ===
    0
  ) {
    return [];
  }

  /*
   * O FastAPI aceita no máximo 500 itens por batch.
   */
  if (
    items.length >
    500
  ) {
    throw new Error(
      "O serviço de classificação aceita no máximo 500 eventos por lote.",
    );
  }

  const response =
    await fetch(
      `${getMlServiceUrl()}/predict-batch`,
      {
        signal: AbortSignal.timeout(60_000),
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            items:
              items.map(
                (
                  item,
                ) => ({
                  event_id:
                    item.eventId,

                  observation:
                    limitText(item.observation, MAX_OBSERVATION_LENGTH),

                  equipment:
                    limitText(item.equipment, MAX_CONTEXT_LENGTH),

                  stop_key_1:
                    limitText(item.stopKey1, MAX_CONTEXT_LENGTH),

                  stop_subkey:
                    limitText(item.stopSubkey, MAX_CONTEXT_LENGTH),

                  stop_type:
                    limitText(item.stopType, MAX_CONTEXT_LENGTH),

                  line:
                    limitText(item.line, MAX_CONTEXT_LENGTH),
                }),
              ),
          }),

        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    const text =
      await response.text();

    throw new Error(
      `Serviço de classificação em lote respondeu ${response.status}: ${text}`,
    );
  }

  const data =
    (
      await response.json()
    ) as MlApiBatchResponse;

  if (
    !Array.isArray(
      data.items,
    )
  ) {
    throw new Error(
      "Resposta inválida do serviço de classificação: items ausente.",
    );
  }

  /*
   * N enviados deve ser igual a N recebidos.
   */
  if (
    data.items.length !==
    items.length
  ) {
    throw new Error(
      "O serviço de classificação retornou "
      +
      `${data.items.length} resultado(s) `
      +
      `para ${items.length} evento(s).`,
    );
  }

  const mapped:
    MlBatchPrediction[] =
    data.items.map(
      (
        item,
      ) => ({
        eventId:
          Number(
            item.event_id,
          ),

        ...mapPrediction(
          item,
        ),
      }),
    );

  /* -------------------------------------------------------
     VALIDAR EVENT IDs
  ------------------------------------------------------- */

  const expectedIds =
    new Set(
      items.map(
        (
          item,
        ) =>
          item.eventId,
      ),
    );

  const returnedIds =
    new Set(
      mapped.map(
        (
          item,
        ) =>
          item.eventId,
      ),
    );

  if (
    expectedIds.size !==
      returnedIds.size ||
    [
      ...expectedIds,
    ].some(
      (
        id,
      ) =>
        !returnedIds.has(
          id,
        ),
    )
  ) {
    throw new Error(
      "O serviço de classificação retornou IDs diferentes dos eventos enviados.",
    );
  }

  if (
    mapped.some(
      (
        item,
      ) =>
        !Number.isInteger(
          item.eventId,
        ) ||
        item.eventId <=
          0,
    )
  ) {
    throw new Error(
      "O serviço de classificação retornou event_id inválido.",
    );
  }

  return mapped;
}

