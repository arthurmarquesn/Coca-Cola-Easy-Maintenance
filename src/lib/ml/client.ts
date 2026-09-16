export interface MlPrediction {
  modelVersion: string;

  failedComponentCode: string;

  failureMode: string;

  confidence: number;

  topPredictions: Array<{
    failedComponentCode: string;

    failureMode: string;

    confidence: number;
  }>;
}


export interface MlPredictionInput {
  observation: string;

  equipment?: string | null;

  stopKey1?: string | null;

  stopSubkey?: string | null;

  stopType?: string | null;
}


export interface MlBatchPredictionInput
  extends MlPredictionInput {
  eventId: number;
}


export interface MlBatchPrediction
  extends MlPrediction {
  eventId: number;
}


export interface MlHealth {
  available: boolean;

  status: string;

  modelVersion: string | null;
}


interface MlApiPrediction {
  model_version: string;

  failed_component_code: string;

  failure_mode: string;

  confidence: number;

  top_predictions: Array<{
    failed_component_code: string;

    failure_mode: string;

    confidence: number;
  }>;
}


interface MlApiBatchPrediction
  extends MlApiPrediction {
  event_id: number;
}


interface MlApiBatchResponse {
  model_version: string;

  items:
    MlApiBatchPrediction[];
}


interface MlApiHealth {
  status: string;

  model_version: string;
}


function getMlServiceUrl(): string {
  const value =
    process.env
      .ML_SERVICE_URL
      ?.trim();

  if (!value) {
    throw new Error(
      "ML_SERVICE_URL não configurado.",
    );
  }

  return value.replace(
    /\/+$/,
    "",
  );
}


function mapPrediction(
  data: MlApiPrediction,
): MlPrediction {
  return {
    modelVersion:
      data.model_version,

    failedComponentCode:
      data
        .failed_component_code,

    failureMode:
      data.failure_mode,

    confidence:
      data.confidence,

    topPredictions:
      data.top_predictions.map(
        (
          prediction,
        ) => ({
          failedComponentCode:
            prediction
              .failed_component_code,

          failureMode:
            prediction
              .failure_mode,

          confidence:
            prediction
              .confidence,
        }),
      ),
  };
}


export async function getMlHealth():
Promise<MlHealth> {
  try {
    const response =
      await fetch(
        `${getMlServiceUrl()}/health`,
        {
          cache:
            "no-store",
        },
      );

    if (!response.ok) {
      return {
        available:
          false,

        status:
          "offline",

        modelVersion:
          null,
      };
    }

    const data =
      (await response.json()) as
        MlApiHealth;

    return {
      available:
        data.status ===
        "ok",

      status:
        data.status,

      modelVersion:
        data.model_version,
    };
  } catch {
    return {
      available:
        false,

      status:
        "offline",

      modelVersion:
        null,
    };
  }
}


export async function predictFailure(
  input:
    MlPredictionInput,
): Promise<MlPrediction> {
  const response =
    await fetch(
      `${getMlServiceUrl()}/predict`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            observation:
              input.observation,

            equipment:
              input.equipment ??
              "",

            stop_key_1:
              input.stopKey1 ??
              "",

            stop_subkey:
              input.stopSubkey ??
              "",

            stop_type:
              input.stopType ??
              "",
          }),

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Modelo ML respondeu ${response.status}: ${text}`,
    );
  }

  const data =
    (await response.json()) as
      MlApiPrediction;

  return mapPrediction(
    data,
  );
}


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

  const response =
    await fetch(
      `${getMlServiceUrl()}/predict-batch`,
      {
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
                    item.observation,

                  equipment:
                    item.equipment ??
                    "",

                  stop_key_1:
                    item.stopKey1 ??
                    "",

                  stop_subkey:
                    item.stopSubkey ??
                    "",

                  stop_type:
                    item.stopType ??
                    "",
                }),
              ),
          }),

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Modelo ML em lote respondeu ${response.status}: ${text}`,
    );
  }

  const data =
    (await response.json()) as
      MlApiBatchResponse;

  return data.items.map(
    (
      item,
    ) => ({
      eventId:
        item.event_id,

      ...mapPrediction(
        item,
      ),
    }),
  );
}