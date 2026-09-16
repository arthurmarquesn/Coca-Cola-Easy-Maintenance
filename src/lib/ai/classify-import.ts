import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  AI_MODEL,
  groq,
} from "@/lib/ai/client";

import {
  buildFailureModeLabel,
  FAILURE_MODE_CODES,
  TECHNICAL_CATEGORIES,
} from "@/lib/maintenance/classification-taxonomy";

import type {
  FailureModeCode,
  TechnicalCategory,
} from "@/lib/maintenance/classification-taxonomy";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const AI_BATCH_SIZE = 4;

const AI_REQUEST_DELAY_MS =
  1500;

const AI_MAX_RETRIES = 5;

const MAX_TEXT_LENGTH =
  700;

/* =========================================================
   BANCO
========================================================= */

interface EventGroupRow
  extends RowDataPacket {
  source_stop_type:
    | string
    | null;

  source_equipment_name:
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

  event_count: number;
}

interface CountRow
  extends RowDataPacket {
  total_events: number;

  classified_events: number;
}

/* =========================================================
   INPUT IA
========================================================= */

interface AIGroupInput {
  groupId: number;

  equipment:
    | string
    | null;

  stopType:
    | string
    | null;

  stopSubkey:
    | string
    | null;

  stopKey1:
    | string
    | null;

  observation:
    | string
    | null;

  occurrences: number;
}

/* =========================================================
   OUTPUT BRUTO
========================================================= */

interface RawAIClassification {
  groupId?: unknown;

  failureModeCode?: unknown;

  failureDetail?: unknown;

  system?: unknown;

  technicalCategory?: unknown;

  confidence?: unknown;

  explanation?: unknown;
}

interface RawAIResponse {
  classifications?: unknown;
}

/* =========================================================
   OUTPUT VALIDADO
========================================================= */

interface AIClassification {
  groupId: number;

  failureModeCode:
    FailureModeCode;

  failureDetail:
    string | null;

  system: string;

  technicalCategory:
    TechnicalCategory;

  confidence: number;

  explanation: string;
}

interface GroqLikeError {
  status?: number;

  headers?: {
    get?: (
      name: string,
    ) =>
      | string
      | null;
  };
}

export interface ImportAIResult {
  model: string;

  groupsAnalyzed: number;

  eventsClassifiedThisRun: number;

  totalEvents: number;

  classifiedEvents: number;

  pendingEvents: number;

  limitReached: boolean;
}

/* =========================================================
   HELPERS
========================================================= */

function sleep(
  milliseconds: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function limitText(
  value:
    | string
    | null,
  maxLength: number,
): string | null {
  if (!value) {
    return null;
  }

  const text =
    value.trim();

  if (!text) {
    return null;
  }

  return text.length >
    maxLength
    ? `${text.slice(
        0,
        maxLength,
      )}...`
    : text;
}

function normalizeText(
  value: unknown,
  fallback: string,
  maxLength: number,
) {
  if (
    typeof value !==
    "string"
  ) {
    return fallback;
  }

  const text =
    value
      .trim()
      .replace(/\s+/g, " ");

  if (!text) {
    return fallback;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function normalizeDetail(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  let text =
    value
      .trim()
      .replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  const words =
    text.split(" ");

  /*
     Máximo de 5 palavras.

     É isso que impede a IA de simplesmente copiar
     a observação original.
  */

  text =
    words
      .slice(0, 5)
      .join(" ");

  return text.slice(
    0,
    60,
  );
}

function getMaxGroups() {
  const value =
    Number(
      process.env
        .AI_MAX_GROUPS_PER_IMPORT ??
        20,
    );

  return Number.isFinite(
    value,
  )
    ? Math.min(
        Math.max(
          Math.floor(
            value,
          ),
          1,
        ),
        500,
      )
    : 20;
}

function isFailureModeCode(
  value: unknown,
): value is FailureModeCode {
  return (
    typeof value ===
      "string" &&
    (
      FAILURE_MODE_CODES as readonly string[]
    ).includes(
      value,
    )
  );
}

function isTechnicalCategory(
  value: unknown,
): value is TechnicalCategory {
  return (
    typeof value ===
      "string" &&
    (
      TECHNICAL_CATEGORIES as readonly string[]
    ).includes(
      value,
    )
  );
}

function cleanJson(
  content: string,
) {
  let value =
    content.trim();

  if (
    value.startsWith(
      "```json",
    )
  ) {
    value =
      value.slice(7);
  } else if (
    value.startsWith(
      "```",
    )
  ) {
    value =
      value.slice(3);
  }

  if (
    value.endsWith(
      "```",
    )
  ) {
    value =
      value.slice(
        0,
        -3,
      );
  }

  return value.trim();
}

/* =========================================================
   CONTAGEM
========================================================= */

async function getImportCounts(
  connection: PoolConnection,
  importId: number,
  unitId: number,
) {
  const [rows] =
    await connection.execute<
      CountRow[]
    >(
      `
        SELECT
          COUNT(e.id)
            AS total_events,

          COUNT(ec.id)
            AS classified_events

        FROM maintenance_events e

        LEFT JOIN event_classifications ec
          ON ec.event_id = e.id

        WHERE
          e.import_id = ?
          AND e.unit_id = ?
      `,
      [
        importId,
        unitId,
      ],
    );

  const totalEvents =
    Number(
      rows[0]
        ?.total_events ??
        0,
    );

  const classifiedEvents =
    Number(
      rows[0]
        ?.classified_events ??
        0,
    );

  return {
    totalEvents,

    classifiedEvents,

    pendingEvents:
      Math.max(
        totalEvents -
          classifiedEvents,
        0,
      ),
  };
}

/* =========================================================
   PROMPT
========================================================= */

function getSystemPrompt() {
  return `
Você é especialista em manutenção industrial.

Sua tarefa é transformar apontamentos livres em MODOS DE FALHA curtos, técnicos e reutilizáveis.

A classificação principal NÃO é:

Mecânica
Elétrica
Automação
Pneumática
Hidráulica

Esses valores são apenas áreas técnicas secundárias.

============================================================
OBJETIVO
============================================================

Para cada ocorrência determine:

failureModeCode
failureDetail
system
technicalCategory
confidence
explanation

============================================================
FAILURE MODE
============================================================

failureModeCode deve ser EXATAMENTE um destes:

${FAILURE_MODE_CODES.join(", ")}

============================================================
FAILURE DETAIL
============================================================

failureDetail é o detalhe que torna a classificação específica.

Deve ter entre 1 e 5 palavras.

Não copie a observação inteira.

Não coloque linha, número do equipamento ou localização.

O detalhe deve representar:

- componente afetado
OU
- função afetada
OU
- fenômeno observado

Exemplos:

Observação:
"DESARMOU A BOMBA DO ENVIO DO CARBONATO"

failureModeCode:
DESARME

failureDetail:
bomba de carbonato

Resultado final:
Desarme — bomba de carbonato


Observação:
"SENSOR NÃO DETECTA GARRAFA"

failureModeCode:
FALHA_DETECCAO

failureDetail:
presença de garrafa

Resultado:
Falha de detecção — presença de garrafa


Observação:
"FALHA SENSOR GARRAFA FALSA"

failureModeCode:
FALHA_SENSOR

failureDetail:
garrafa falsa

Resultado:
Falha de sensor — garrafa falsa


Observação:
"REJEITOR LINEAR NÃO RETORNA"

failureModeCode:
FALHA_POSICIONAMENTO

failureDetail:
rejeitor linear

Resultado:
Falha de posicionamento — rejeitor linear


Observação:
"CORREIA ESTEIRA ROMPEU"

failureModeCode:
ROMPIMENTO

failureDetail:
correia

Resultado:
Rompimento — correia


Observação:
"VAZAMENTO DE AR NA VÁLVULA"

failureModeCode:
VAZAMENTO

failureDetail:
válvula pneumática

Resultado:
Vazamento — válvula pneumática


Observação:
"PRESSÃO DE AR BAIXA"

failureModeCode:
PERDA_PRESSAO

failureDetail:
circuito pneumático

Resultado:
Perda de pressão — circuito pneumático


Observação:
"MOTOR NÃO PARTE"

failureModeCode:
FALHA_ACIONAMENTO

failureDetail:
motor

Resultado:
Falha de acionamento — motor


Observação:
"SEM COMUNICAÇÃO COM INVERSOR"

failureModeCode:
FALHA_COMUNICACAO

failureDetail:
inversor

Resultado:
Falha de comunicação — inversor


Observação:
"BOCAL TRAVADO"

failureModeCode:
TRAVAMENTO

failureDetail:
bocal

Resultado:
Travamento — bocal

============================================================
NÍVEL DE ESPECIFICIDADE
============================================================

RUIM, muito genérico:

Falha mecânica
Falha elétrica
Problema de automação
Falha no equipamento
Falha de sensor

MELHOR:

Falha de sensor — garrafa falsa
Falha de detecção — presença de garrafa
Desarme — bomba de carbonato
Travamento — bocal
Rompimento — correia
Falha de comunicação — inversor
Falha de posicionamento — rejeitor linear

RUIM, específico demais:

"Falha do sensor fotoelétrico 302 da entrada da garrafa falsa da linha 5"

============================================================
CAUSA RAIZ
============================================================

NÃO invente causa raiz.

"bomba desarmou"

permite:

DESARME

Não permite assumir:

curto-circuito
sobrecorrente
travamento mecânico

se isso não estiver escrito.

============================================================
EVIDÊNCIAS
============================================================

Prioridade:

1. observation
2. stopKey1
3. stopSubkey
4. equipment
5. stopType

============================================================
SYSTEM
============================================================

system deve ser curto.

Exemplos:

Bombeamento
Sensoriamento
Rejeição
Transmissão
Movimentação
Tampamento
Transportador
Comunicação industrial
Acionamento
Dosagem

============================================================
ÁREA TÉCNICA
============================================================

technicalCategory deve ser um destes:

${TECHNICAL_CATEGORIES.join(", ")}

Se não houver evidência suficiente:

INDETERMINADA

============================================================
JSON
============================================================

Retorne SOMENTE:

{
  "classifications": [
    {
      "groupId": 1,
      "failureModeCode": "DESARME",
      "failureDetail": "bomba de carbonato",
      "system": "Bombeamento",
      "technicalCategory": "INDETERMINADA",
      "confidence": 0.95,
      "explanation": "A observação informa explicitamente o desarme da bomba."
    }
  ]
}

Classifique todos os groupId.
`.trim();
}

/* =========================================================
   GROQ
========================================================= */

async function requestClassification(
  groups: AIGroupInput[],
) {
  let lastError:
    unknown = null;

  for (
    let attempt = 0;
    attempt <
    AI_MAX_RETRIES;
    attempt++
  ) {
    try {
      const completion =
        await groq.chat.completions.create({
          model:
            AI_MODEL,

          temperature:
            0,

          messages: [
            {
              role:
                "system",

              content:
                getSystemPrompt(),
            },

            {
              role:
                "user",

              content:
                JSON.stringify({
                  events:
                    groups,
                }),
            },
          ],

          response_format: {
            type:
              "json_object",
          },
        });

      const content =
        completion
          .choices[0]
          ?.message
          ?.content;

      if (!content) {
        throw new Error(
          "A IA não retornou conteúdo.",
        );
      }

      return content;
    } catch (error) {
      lastError =
        error;

      const groqError =
        error as GroqLikeError;

      if (
        groqError.status !==
        429
      ) {
        throw error;
      }

      const retryAfter =
        groqError
          .headers
          ?.get?.(
            "retry-after",
          );

      const seconds =
        retryAfter
          ? Number(
              retryAfter,
            )
          : NaN;

      const delay =
        Number.isFinite(
          seconds,
        )
          ? seconds *
              1000 +
            1000
          : Math.min(
              3000 *
                2 **
                  attempt,
              30000,
            );

      await sleep(
        delay,
      );
    }
  }

  throw lastError;
}

/* =========================================================
   VALIDA RESPOSTA
========================================================= */

async function classifyBatch(
  groups: AIGroupInput[],
): Promise<
  AIClassification[]
> {
  const content =
    await requestClassification(
      groups,
    );

  const parsed =
    JSON.parse(
      cleanJson(
        content,
      ),
    ) as RawAIResponse;

  if (
    !Array.isArray(
      parsed.classifications,
    )
  ) {
    throw new Error(
      "Resposta inválida da IA.",
    );
  }

  const expectedIds =
    new Set(
      groups.map(
        (group) =>
          group.groupId,
      ),
    );

  const output:
    AIClassification[] = [];

  for (
    const value of
    parsed.classifications
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      continue;
    }

    const raw =
      value as RawAIClassification;

    const groupId =
      Number(
        raw.groupId,
      );

    if (
      !Number.isInteger(
        groupId,
      ) ||
      !expectedIds.has(
        groupId,
      )
    ) {
      continue;
    }

    const failureModeCode:
      FailureModeCode =
        isFailureModeCode(
          raw.failureModeCode,
        )
          ? raw.failureModeCode
          : "FALHA_NAO_IDENTIFICADA";

    const technicalCategory:
      TechnicalCategory =
        isTechnicalCategory(
          raw.technicalCategory,
        )
          ? raw.technicalCategory
          : "INDETERMINADA";

    const confidenceValue =
      Number(
        raw.confidence,
      );

    output.push({
      groupId,

      failureModeCode,

      failureDetail:
        normalizeDetail(
          raw.failureDetail,
        ),

      system:
        normalizeText(
          raw.system,
          "Não identificado",
          80,
        ),

      technicalCategory,

      confidence:
        Number.isFinite(
          confidenceValue,
        )
          ? Math.min(
              Math.max(
                confidenceValue,
                0,
              ),
              1,
            )
          : 0.5,

      explanation:
        normalizeText(
          raw.explanation,
          "Classificação baseada no apontamento.",
          350,
        ),
    });
  }

  return output;
}

/* =========================================================
   CLASSIFICA IMPORTAÇÃO
========================================================= */

export async function classifyImportWithAI(
  connection: PoolConnection,
  importId: number,
  unitId: number,
): Promise<ImportAIResult> {
  const maxGroups =
    getMaxGroups();

  const [groups] =
    await connection.query<
      EventGroupRow[]
    >(
      `
        SELECT
          e.source_stop_type,
          e.source_equipment_name,
          e.source_stop_subkey,
          e.source_stop_key_1,

          NULLIF(
            TRIM(
              e.observation
            ),
            ''
          ) AS observation,

          COUNT(*) AS event_count

        FROM maintenance_events e

        LEFT JOIN event_classifications ec
          ON ec.event_id =
            e.id

        WHERE
          e.import_id = ?

          AND e.unit_id = ?

          AND ec.id IS NULL

        GROUP BY
          e.source_stop_type,
          e.source_equipment_name,
          e.source_stop_subkey,
          e.source_stop_key_1,

          NULLIF(
            TRIM(
              e.observation
            ),
            ''
          )

        ORDER BY
          event_count DESC

        LIMIT ${maxGroups}
      `,
      [
        importId,
        unitId,
      ],
    );

  if (
    groups.length ===
    0
  ) {
    const counts =
      await getImportCounts(
        connection,
        importId,
        unitId,
      );

    return {
      model:
        AI_MODEL,

      groupsAnalyzed:
        0,

      eventsClassifiedThisRun:
        0,

      ...counts,

      limitReached:
        false,
    };
  }

  let groupsAnalyzed =
    0;

  let eventsClassifiedThisRun =
    0;

  for (
    let offset = 0;
    offset <
    groups.length;
    offset +=
      AI_BATCH_SIZE
  ) {
    const currentGroups =
      groups.slice(
        offset,
        offset +
          AI_BATCH_SIZE,
      );

    const aiInput =
      currentGroups.map(
        (
          group,
          index,
        ): AIGroupInput => ({
          groupId:
            offset +
            index +
            1,

          equipment:
            limitText(
              group
                .source_equipment_name,
              180,
            ),

          stopType:
            limitText(
              group
                .source_stop_type,
              120,
            ),

          stopSubkey:
            limitText(
              group
                .source_stop_subkey,
              160,
            ),

          stopKey1:
            limitText(
              group
                .source_stop_key_1,
              160,
            ),

          observation:
            limitText(
              group
                .observation,
              MAX_TEXT_LENGTH,
            ),

          occurrences:
            Number(
              group
                .event_count,
            ),
        }),
      );

    const classifications =
      await classifyBatch(
        aiInput,
      );

    const classificationMap =
      new Map<
        number,
        AIClassification
      >();

    for (
      const classification of
      classifications
    ) {
      classificationMap.set(
        classification.groupId,
        classification,
      );
    }

    for (
      let index = 0;
      index <
      currentGroups.length;
      index++
    ) {
      const group =
        currentGroups[
          index
        ];

      const groupId =
        offset +
        index +
        1;

      const classification =
        classificationMap.get(
          groupId,
        );

      if (
        !classification
      ) {
        continue;
      }

      const failureMode =
        buildFailureModeLabel(
          classification
            .failureModeCode,

          classification
            .failureDetail,
        );

      const notes =
        JSON.stringify({
          version:
            6,

          model:
            AI_MODEL,

          failureModeCode:
            classification
              .failureModeCode,

          failureDetail:
            classification
              .failureDetail,

          failureMode,

          system:
            classification
              .system,

          category:
            classification
              .technicalCategory,

          explanation:
            classification
              .explanation,
        });

      const [
        result,
      ] =
        await connection.execute<
          ResultSetHeader
        >(
          `
            INSERT IGNORE INTO event_classifications (
              event_id,
              category_id,
              failure_system_id,
              failure_mode_id,
              classified_by_user_id,
              source,
              confidence,
              status,
              classification_notes
            )

            SELECT
              e.id,
              NULL,
              NULL,
              NULL,
              NULL,
              'IA',
              ?,
              'PENDENTE_REVISAO',
              ?

            FROM maintenance_events e

            LEFT JOIN event_classifications ec
              ON ec.event_id =
                e.id

            WHERE
              e.import_id = ?

              AND e.unit_id = ?

              AND ec.id IS NULL

              AND e.source_stop_type
                <=> ?

              AND e.source_equipment_name
                <=> ?

              AND e.source_stop_subkey
                <=> ?

              AND e.source_stop_key_1
                <=> ?

              AND NULLIF(
                TRIM(
                  e.observation
                ),
                ''
              )
                <=> ?
          `,
          [
            classification
              .confidence,

            notes,

            importId,

            unitId,

            group
              .source_stop_type,

            group
              .source_equipment_name,

            group
              .source_stop_subkey,

            group
              .source_stop_key_1,

            group
              .observation,
          ],
        );

      eventsClassifiedThisRun +=
        result.affectedRows;

      groupsAnalyzed++;
    }

    if (
      offset +
        AI_BATCH_SIZE <
      groups.length
    ) {
      await sleep(
        AI_REQUEST_DELAY_MS,
      );
    }
  }

  const counts =
    await getImportCounts(
      connection,
      importId,
      unitId,
    );

  return {
    model:
      AI_MODEL,

    groupsAnalyzed,

    eventsClassifiedThisRun,

    ...counts,

    limitReached:
      counts.pendingEvents >
      0,
  };
}