import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import {
  classificationNoteField,
} from "@/lib/analytics/sql";

import type {
  AccessibleMaspRow,
} from "@/lib/masp/api";

import type {
  MaspCategory,
} from "@/lib/masp/domain";


const DEFAULT_HISTORY_DAYS =
  180;

const STOPWORDS =
  new Set([
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "esta",
    "este",
    "foi",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "que",
    "sem",
    "um",
    "uma",
  ]);

const CATEGORY_TERMS:
Record<MaspCategory, readonly string[]> = {
  MAQUINA: [
    "atuador",
    "bomba",
    "cabo",
    "cabeamento",
    "cilindro",
    "correia",
    "corrente",
    "engrenagem",
    "inversor",
    "motor",
    "rolamento",
    "sensor",
    "valvula",
  ],
  METODO: [
    "ajuste",
    "limpeza",
    "parametrizacao",
    "procedimento",
    "referencia",
    "regulagem",
    "sequencia",
    "setup",
    "sincronismo",
    "troca formato",
  ],
  MAO_DE_OBRA: [
    "checagem",
    "execucao",
    "inspecao",
    "procedimento manual",
    "treinamento",
  ],
  MATERIAL: [
    "embalagem",
    "filme",
    "garrafa",
    "insumo",
    "pacote",
    "produto",
    "rotulo",
    "tampa",
  ],
  MEDICAO: [
    "calibracao",
    "instrumento",
    "leitura",
    "medicao",
    "referencia medicao",
  ],
  MEIO_AMBIENTE: [
    "agua",
    "calor",
    "condensacao",
    "poeira",
    "temperatura",
    "umidade",
  ],
};

interface HistoricalEventRow
  extends RowDataPacket {
  id: number;
  equipment_id:
    | number
    | null;
  observation:
    | string
    | null;
  component_code:
    | string
    | null;
  failure_mode:
    | string
    | null;
  failure_origin:
    | "MANUTENCAO"
    | "OPERACAO"
    | null;
}

interface SuggestionAccumulator {
  category: MaspCategory;
  term: string;
  eventIds: Set<number>;
  relevance: number;
}

export interface MaspSuggestion {
  category: MaspCategory;
  description: string;
  supportCount: number;
  source: "HISTORY";
  sampleEventIds: number[];
}

function stripAccents(
  value: string,
): string {
  return value
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    );
}

export function extractObservationTerms(
  value: string,
): string[] {
  const tokens =
    stripAccents(
      value,
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9\s]/g,
        " ",
      )
      .split(
        /\s+/,
      )
      .filter(
        (
          token,
        ) =>
          token.length > 2 &&
          !STOPWORDS.has(
            token,
          ),
      );

  const bigrams =
    tokens
      .slice(
        0,
        -1,
      )
      .map(
        (
          token,
          index,
        ) =>
          `${token} ${tokens[index + 1]}`,
      );

  return [
    ...new Set([
      ...tokens,
      ...bigrams,
    ]),
  ];
}

function normalizeComparable(
  value:
    | string
    | null,
): string {
  return stripAccents(
    value ?? "",
  )
    .toLowerCase()
    .trim();
}

function historicalRelevance(
  row: HistoricalEventRow,
  masp: AccessibleMaspRow,
  problemTerms: Set<string>,
): number {
  let score =
    1;

  if (
    masp.equipment_id &&
    Number(
      row.equipment_id,
    ) ===
      Number(
        masp.equipment_id,
      )
  ) {
    score += 4;
  }

  if (
    masp.recurrence_component_code &&
    normalizeComparable(
      row.component_code,
    ) ===
      normalizeComparable(
        masp.recurrence_component_code,
      )
  ) {
    score += 3;
  }

  if (
    masp.recurrence_failure_mode &&
    normalizeComparable(
      row.failure_mode,
    ) ===
      normalizeComparable(
        masp.recurrence_failure_mode,
      )
  ) {
    score += 3;
  }

  if (
    masp.recurrence_failure_origin &&
    row.failure_origin ===
      masp.recurrence_failure_origin
  ) {
    score += 2;
  }

  const observationTerms =
    extractObservationTerms(
      row.observation ?? "",
    );

  const sharedTerms =
    observationTerms.filter(
      (
        term,
      ) =>
        problemTerms.has(
          term,
        ),
    ).length;

  return score +
    Math.min(
      sharedTerms,
      4,
    );
}

function descriptionFor(
  category: MaspCategory,
  term: string,
): string {
  const prefixes:
  Record<MaspCategory, string> = {
    MAQUINA:
      "Verificar condição do item",
    METODO:
      "Verificar método relacionado a",
    MAO_DE_OBRA:
      "Verificar condição de execução relacionada a",
    MATERIAL:
      "Verificar influência do material",
    MEDICAO:
      "Verificar medição relacionada a",
    MEIO_AMBIENTE:
      "Verificar condição ambiental",
  };

  return `${prefixes[category]} “${term}”`;
}

export async function generateMaspSuggestions(
  connection: PoolConnection,
  masp: AccessibleMaspRow,
  historyDays =
    DEFAULT_HISTORY_DAYS,
): Promise<MaspSuggestion[]> {
  const safeDays =
    Math.max(
      30,
      Math.min(
        Math.trunc(
          historyDays,
        ),
        730,
      ),
    );

  const [
    rows,
  ] =
    await connection.query<
      HistoricalEventRow[]
    >(
      `
        SELECT
            me.id,
            me.equipment_id,
            me.observation,
            COALESCE(
                fm.code,
                ${classificationNoteField("ec", "failedComponentCode")},
                latest_suggestion.failed_component_code
            ) AS component_code,
            COALESCE(
                fm.name,
                ${classificationNoteField("ec", "failureMode")},
                latest_suggestion.failure_mode
            ) AS failure_mode,
            COALESCE(
                origin_review.manual_origin,
                ec.failure_origin,
                latest_origin.failure_origin,
                latest_suggestion.failure_origin
            ) AS failure_origin
        FROM
            maintenance_events me
        LEFT JOIN
            event_classifications ec
                ON ec.event_id = me.id
                AND ec.status IN (
                    'APROVADA',
                    'CORRIGIDA'
                )
        LEFT JOIN
            failure_modes fm
                ON fm.id = ec.mode_id
        LEFT JOIN
            event_failure_origin_reviews origin_review
                ON origin_review.event_id = me.id
        LEFT JOIN
            classification_suggestions latest_suggestion
                ON latest_suggestion.id = (
                    SELECT
                        cs.id
                    FROM
                        classification_suggestions cs
                    WHERE
                        cs.event_id = me.id
                        AND cs.status <> 'DESCARTADA'
                    ORDER BY
                        cs.created_at DESC,
                        cs.id DESC
                    LIMIT 1
                )
        LEFT JOIN
            event_failure_origin_predictions latest_origin
                ON latest_origin.id = (
                    SELECT
                        eop.id
                    FROM
                        event_failure_origin_predictions eop
                    WHERE
                        eop.event_id = me.id
                    ORDER BY
                        eop.created_at DESC,
                        eop.id DESC
                    LIMIT 1
                )
        WHERE
            me.unit_id = ?
            AND me.event_date >=
                DATE_SUB(
                    CURRENT_DATE,
                    INTERVAL ? DAY
                )
            AND me.observation IS NOT NULL
            AND TRIM(me.observation) <> ''
        ORDER BY
            me.event_date DESC,
            me.id DESC
        LIMIT 2000
      `,
      [
        masp.unit_id,
        safeDays,
      ],
    );

  const problemTerms =
    new Set(
      extractObservationTerms(
        masp.problem_statement,
      ),
    );

  const accumulators =
    new Map<
      string,
      SuggestionAccumulator
    >();

  for (
    const row
    of rows
  ) {
    const terms =
      new Set(
        extractObservationTerms(
          row.observation ?? "",
        ),
      );

    const relevance =
      historicalRelevance(
        row,
        masp,
        problemTerms,
      );

    for (
      const [
        category,
        keywords,
      ]
      of Object.entries(
        CATEGORY_TERMS,
      ) as Array<
        [
          MaspCategory,
          readonly string[],
        ]
      >
    ) {
      for (
        const term
        of keywords
      ) {
        if (
          !terms.has(
            term,
          )
        ) {
          continue;
        }

        const key =
          `${category}:${term}`;

        const current =
          accumulators.get(
            key,
          ) ?? {
            category,
            term,
            eventIds:
              new Set<number>(),
            relevance: 0,
          };

        current.eventIds.add(
          Number(
            row.id,
          ),
        );

        current.relevance +=
          relevance;

        accumulators.set(
          key,
          current,
        );
      }
    }
  }

  return [
    ...accumulators.values(),
  ]
    .filter(
      (
        item,
      ) =>
        item.eventIds.size >=
        2,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.relevance -
          left.relevance ||
        right.eventIds.size -
          left.eventIds.size ||
        left.term.localeCompare(
          right.term,
          "pt-BR",
        ),
    )
    .slice(
      0,
      18,
    )
    .map(
      (
        item,
      ) => ({
        category:
          item.category,
        description:
          descriptionFor(
            item.category,
            item.term,
          ),
        supportCount:
          item.eventIds.size,
        source:
          "HISTORY",
        sampleEventIds: [
          ...item.eventIds,
        ].slice(
          0,
          3,
        ),
      }),
    );
}
