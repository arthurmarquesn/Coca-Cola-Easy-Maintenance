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

   Uma rodada = uma chamada para a Groq.

   Evitamos:
   - várias chamadas pequenas;
   - delays fixos de 20/25 segundos;
   - respostas JSON muito verbosas.
========================================================= */

const DEFAULT_MAX_GROUPS = 24;

const MAX_GROUPS_LIMIT = 32;

const MAX_OBSERVATION_LENGTH = 260;

const MAX_EQUIPMENT_LENGTH = 100;

const MAX_FIELD_LENGTH = 80;

const MAX_RETRIES = 5;

const MIN_RATE_LIMIT_WAIT_MS = 3000;

/* =========================================================
   BANCO
========================================================= */

interface EventGroupRow extends RowDataPacket {
  source_stop_type: string | null;

  source_equipment_name: string | null;

  source_stop_subkey: string | null;

  source_stop_key_1: string | null;

  observation: string | null;

  event_count: number;
}

interface CountRow extends RowDataPacket {
  total_events: number;

  classified_events: number;
}

/* =========================================================
   INPUT PARA IA
========================================================= */

interface AIGroupInput {
  id: number;

  ob: string | null;

  eq: string | null;

  k1: string | null;

  sk: string | null;

  st: string | null;
}

/* =========================================================
   RESPOSTA DA IA

   Formato compacto:

   [
     groupId,
     failureModeCode,
     failureDetail,
     system,
     technicalCategory,
     confidence
   ]
========================================================= */

type RawClassificationTuple = [
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
];

interface RawAIResponse {
  c?: unknown;
}

/* =========================================================
   CLASSIFICAÇÃO VALIDADA
========================================================= */

interface AIClassification {
  groupId: number;

  failureModeCode: FailureModeCode;

  failureDetail: string | null;

  system: string;

  technicalCategory: TechnicalCategory;

  confidence: number;
}

/* =========================================================
   GROQ ERROR
========================================================= */

interface GroqLikeError {
  status?: number;

  headers?: {
    get?: (
      name: string,
    ) => string | null;
  };
}

/* =========================================================
   RESULTADO DA FUNÇÃO
========================================================= */

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

function cleanText(
  value: string | null,
  maxLength: number,
): string | null {
  if (!value) {
    return null;
  }

  const text =
    value
      .trim()
      .replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function normalizeString(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string"
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
    typeof value !== "string"
  ) {
    return null;
  }

  const text =
    value
      .trim()
      .replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  return text
    .split(" ")
    .slice(0, 5)
    .join(" ")
    .slice(0, 60);
}

/* =========================================================
   ENUM VALIDATION
========================================================= */

function isFailureModeCode(
  value: unknown,
): value is FailureModeCode {
  return (
    typeof value === "string" &&
    (
      FAILURE_MODE_CODES as readonly string[]
    ).includes(value)
  );
}

function isTechnicalCategory(
  value: unknown,
): value is TechnicalCategory {
  return (
    typeof value === "string" &&
    (
      TECHNICAL_CATEGORIES as readonly string[]
    ).includes(value)
  );
}

/* =========================================================
   MAX GROUPS
========================================================= */

function getMaxGroups() {
  const configured =
    Number(
      process.env
        .AI_MAX_GROUPS_PER_IMPORT ??
        DEFAULT_MAX_GROUPS,
    );

  if (
    !Number.isFinite(
      configured,
    )
  ) {
    return DEFAULT_MAX_GROUPS;
  }

  return Math.min(
    Math.max(
      Math.floor(
        configured,
      ),
      1,
    ),
    MAX_GROUPS_LIMIT,
  );
}

/* =========================================================
   RATE LIMIT PARSER

   Exemplos Groq:

   13.057s
   1.5s
   800ms
   1m
   8m38.4s
========================================================= */

function parseDurationToMilliseconds(
  value: string,
): number | null {
  const text =
    value
      .trim()
      .toLowerCase();

  let total = 0;

  const minutes =
    text.match(
      /([\d.]+)m/,
    );

  const seconds =
    text.match(
      /([\d.]+)s/,
    );

  const milliseconds =
    text.match(
      /([\d.]+)ms/,
    );

  if (minutes) {
    total +=
      Number(minutes[1]) *
      60 *
      1000;
  }

  if (seconds) {
    total +=
      Number(seconds[1]) *
      1000;
  }

  /*
     Só considera ms isoladamente.
  */

  if (
    milliseconds &&
    !seconds
  ) {
    total +=
      Number(milliseconds[1]);
  }

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return Math.ceil(total);
}

/* =========================================================
   RETRY DELAY

   Não existem mais delays fixos entre chamadas.

   Só esperamos quando realmente ocorre 429.
========================================================= */

function getRateLimitWait(
  error: unknown,
  attempt: number,
) {
  const groqError =
    error as GroqLikeError;

  let wait =
    MIN_RATE_LIMIT_WAIT_MS;

  const resetTokens =
    groqError
      .headers
      ?.get?.(
        "x-ratelimit-reset-tokens",
      );

  if (resetTokens) {
    const parsed =
      parseDurationToMilliseconds(
        resetTokens,
      );

    if (parsed) {
      wait =
        Math.max(
          wait,
          parsed,
        );
    }
  }

  const retryAfter =
    groqError
      .headers
      ?.get?.(
        "retry-after",
      );

  if (retryAfter) {
    const seconds =
      Number(retryAfter);

    if (
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      wait =
        Math.max(
          wait,
          seconds * 1000,
        );
    }
  }

  /*
     Se não recebemos informação útil,
     usamos backoff progressivo.
  */

  if (
    !resetTokens &&
    !retryAfter
  ) {
    wait =
      Math.max(
        wait,
        3000 *
          2 ** attempt,
      );
  }

  /*
     Margem pequena depois do reset.
  */

  return wait + 1200;
}

/* =========================================================
   JSON
========================================================= */

function extractJson(
  content: string,
): RawAIResponse {
  let text =
    content.trim();

  text =
    text.replace(
      /^```(?:json)?\s*/i,
      "",
    );

  text =
    text.replace(
      /\s*```$/i,
      "",
    );

  const start =
    text.indexOf("{");

  const end =
    text.lastIndexOf("}");

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      "A IA não retornou JSON válido.",
    );
  }

  const jsonText =
    text.slice(
      start,
      end + 1,
    );

  return JSON.parse(
    jsonText,
  ) as RawAIResponse;
}

/* =========================================================
   VALIDAÇÃO
========================================================= */

function validateResponse(
  parsed: RawAIResponse,
  groups: AIGroupInput[],
): AIClassification[] {
  if (
    !Array.isArray(parsed.c)
  ) {
    throw new Error(
      "A IA não retornou a lista de classificações.",
    );
  }

  const expectedIds =
    new Set(
      groups.map(
        (group) =>
          group.id,
      ),
    );

  const usedIds =
    new Set<number>();

  const result:
    AIClassification[] = [];

  for (
    const rawItem of parsed.c
  ) {
    if (
      !Array.isArray(rawItem) ||
      rawItem.length < 6
    ) {
      continue;
    }

    const tuple =
      rawItem as RawClassificationTuple;

    const groupId =
      Number(tuple[0]);

    if (
      !Number.isInteger(
        groupId,
      ) ||
      !expectedIds.has(
        groupId,
      ) ||
      usedIds.has(
        groupId,
      )
    ) {
      continue;
    }

    usedIds.add(
      groupId,
    );

    const failureModeCode:
      FailureModeCode =
        isFailureModeCode(
          tuple[1],
        )
          ? tuple[1]
          : "NAO_IDENTIFICADO";

    const failureDetail =
      normalizeDetail(
        tuple[2],
      );

    const system =
      normalizeString(
        tuple[3],
        "Não identificado",
        80,
      );

    const technicalCategory:
      TechnicalCategory =
        isTechnicalCategory(
          tuple[4],
        )
          ? tuple[4]
          : "INDETERMINADA";

    const rawConfidence =
      Number(tuple[5]);

    const confidence =
      Number.isFinite(
        rawConfidence,
      )
        ? Math.max(
            0,
            Math.min(
              rawConfidence,
              1,
            ),
          )
        : 0.5;

    result.push({
      groupId,

      failureModeCode,

      failureDetail,

      system,

      technicalCategory,

      confidence,
    });
  }

  return result;
}

/* =========================================================
   COUNTS
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
      rows[0]?.total_events ??
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
   PROMPT COMPACTO

   Saída:

   {
     "c": [
       [
         1,
         "DESARME",
         "bomba de carbonato",
         "Bombeamento",
         "INDETERMINADA",
         0.96
       ]
     ]
   }

   Isso reduz muito os tokens de saída.
========================================================= */

function buildPrompt(
  groups: AIGroupInput[],
) {
  return `
Classifique modos de falha de manutenção industrial.

Não identifique causa raiz.

Prioridade das evidências:
ob > k1 > sk > eq > st.

Campos:
ob=observação
eq=equipamento
k1=chave
sk=subchave
st=tipo de parada

Modo deve ser exatamente um:
${FAILURE_MODE_CODES.join(",")}

Categoria deve ser exatamente uma:
${TECHNICAL_CATEGORIES.join(",")}

Regras:
- failureDetail: 1 a 5 palavras.
- detalhe deve identificar componente/fenômeno.
- não use Mecânica, Elétrica ou Automação como modo de falha.
- system deve ser curto.
- se área técnica não estiver clara use INDETERMINADA.
- não invente causa.
- todos os IDs devem ser retornados.

Exemplos:

"DESARMOU BOMBA ENVIO CARBONATO"
=> DESARME | bomba de carbonato | Bombeamento

"SENSOR NÃO DETECTA GARRAFA"
=> FALHA_DETECCAO | presença de garrafa | Sensoriamento

"FALHA SENSOR GARRAFA FALSA"
=> FALHA_SENSOR | garrafa falsa | Sensoriamento

"CORREIA ROMPEU"
=> ROMPIMENTO | correia | Transmissão

"REJEITOR LINEAR NÃO RETORNA"
=> FALHA_POSICIONAMENTO | rejeitor linear | Rejeição

Retorne SOMENTE JSON compacto neste formato:

{
  "c":[
    [
      id,
      "failureModeCode",
      "failureDetail",
      "system",
      "technicalCategory",
      confidence
    ]
  ]
}

Eventos:
${JSON.stringify(groups)}
`.trim();
}

/* =========================================================
   UMA ÚNICA CHAMADA POR RODADA
========================================================= */

async function requestClassification(
  groups: AIGroupInput[],
): Promise<AIClassification[]> {
  let lastError:
    unknown = null;

  for (
    let attempt = 0;
    attempt < MAX_RETRIES;
    attempt++
  ) {
    try {
      const completion =
        await groq.chat.completions.create({
          model:
            AI_MODEL,

          temperature:
            0,

          max_completion_tokens:
            1400,

          messages: [
            {
              role:
                "user",

              content:
                buildPrompt(
                  groups,
                ),
            },
          ],
        });

      const content =
        completion
          .choices[0]
          ?.message
          ?.content;

      if (!content) {
        throw new Error(
          "A IA retornou resposta vazia.",
        );
      }

      const parsed =
        extractJson(
          content,
        );

      const classifications =
        validateResponse(
          parsed,
          groups,
        );

      if (
        classifications.length ===
        0
      ) {
        throw new Error(
          "Nenhuma classificação válida foi retornada.",
        );
      }

      console.log(
        `IA: ${classifications.length}/${groups.length} grupos classificados.`,
      );

      return classifications;
    } catch (error) {
      lastError =
        error;

      const groqError =
        error as GroqLikeError;

      /* ===================================================
         RATE LIMIT
      =================================================== */

      if (
        groqError.status ===
        429
      ) {
        const wait =
          getRateLimitWait(
            error,
            attempt,
          );

        console.warn(
          `Rate limit Groq. Aguardando ${(
            wait / 1000
          ).toFixed(
            1,
          )}s.`,
        );

        await sleep(wait);

        continue;
      }

      /* ===================================================
         JSON MALFORMADO

         Espera apenas 1 segundo e tenta novamente.
      =================================================== */

      if (
        error instanceof
        SyntaxError
      ) {
        console.warn(
          "JSON inválido retornado pela IA. Tentando novamente.",
        );

        await sleep(1000);

        continue;
      }

      if (
        error instanceof
        Error &&
        (
          error.message.includes(
            "JSON",
          ) ||
          error.message.includes(
            "classificação",
          )
        )
      ) {
        console.warn(
          `${error.message} Tentando novamente.`,
        );

        await sleep(1000);

        continue;
      }

      throw error;
    }
  }

  throw (
    lastError ??
    new Error(
      "Não foi possível classificar os eventos.",
    )
  );
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

  /* =======================================================
     BUSCA OS MAIORES GRUPOS PENDENTES
  ======================================================= */

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
          ON ec.event_id = e.id

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

  /* =======================================================
     SEM PENDENTES
  ======================================================= */

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

  /* =======================================================
     MONTA INPUT

     Um único pacote.
  ======================================================= */

  const aiInput =
    groups.map(
      (
        group,
        index,
      ): AIGroupInput => ({
        id:
          index + 1,

        ob:
          cleanText(
            group.observation,
            MAX_OBSERVATION_LENGTH,
          ),

        eq:
          cleanText(
            group
              .source_equipment_name,
            MAX_EQUIPMENT_LENGTH,
          ),

        k1:
          cleanText(
            group
              .source_stop_key_1,
            MAX_FIELD_LENGTH,
          ),

        sk:
          cleanText(
            group
              .source_stop_subkey,
            MAX_FIELD_LENGTH,
          ),

        st:
          cleanText(
            group
              .source_stop_type,
            MAX_FIELD_LENGTH,
          ),
      }),
    );

  /* =======================================================
     UMA CHAMADA GROQ
  ======================================================= */

  const classifications =
    await requestClassification(
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

  let groupsAnalyzed = 0;

  let eventsClassifiedThisRun =
    0;

  /* =======================================================
     SALVA RESULTADOS
  ======================================================= */

  for (
    let index = 0;
    index < groups.length;
    index++
  ) {
    const group =
      groups[index];

    const groupId =
      index + 1;

    const classification =
      classificationMap.get(
        groupId,
      );

    /*
       Caso a IA não tenha retornado determinado grupo,
       ele permanece pendente para outra rodada.
    */

    if (!classification) {
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
          9,

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
      });

    const [result] =
      await connection.execute<
        ResultSetHeader
      >(
        `
          INSERT IGNORE INTO event_classifications (
            event_id,
            category_id,
            system_id,
            mode_id,
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
            ON ec.event_id = e.id

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

          group.observation,
        ],
      );

    eventsClassifiedThisRun +=
      result.affectedRows;

    groupsAnalyzed++;
  }

  /* =======================================================
     CONTAGEM FINAL
  ======================================================= */

  const counts =
    await getImportCounts(
      connection,
      importId,
      unitId,
    );

  console.log(
    `Rodada concluída: ${eventsClassifiedThisRun} eventos classificados. ${counts.pendingEvents} pendentes.`,
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