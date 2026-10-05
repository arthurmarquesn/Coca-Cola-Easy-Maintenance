/* =========================================================
   SQL COMPARTILHADO DE ANALYTICS

   Reaproveitado por:
   - /api/analytics/reliability (Pareto e Jack-Knife já existentes)
   - /api/analytics/charts      (gráficos complementares)

   Mantenha a lógica aqui. Duplicar a expressão de modo de
   falha em outra rota faz os números das telas divergirem.
========================================================= */

/*
  "P.EQ.LINHA" é a parada que gerou chamado de manutenção.
  Qualquer outro valor é parada operacional, resolvida pelo
  próprio operador.
*/
export const MAINTENANCE_STOP_TYPE =
  "P.EQ.LINHA";

/*
  Rótulo mostrado quando a classificação automática não
  conseguiu identificar o modo de falha. É o grupo que
  precisa de análise manual.
*/
export const UNCLASSIFIED_LABEL =
  "Sem Modo de Falha Identificado";

/*
  A classificação oficial em event_classifications sempre tem
  prioridade.

  classification_suggestions existe apenas como fallback para
  preservar as classificações históricas já geradas antes da
  retirada da tela do Modelo ML.

  Depende dos aliases `ec` (event_classifications) e `cs`
  (classification_suggestions) estarem no FROM/JOIN.
*/
export const FAILURE_MODE_EXPRESSION = `
  CASE WHEN ec.event_id IS NOT NULL AND ec.status NOT IN ('APROVADA', 'CORRIGIDA')
    THEN 'Não classificado'
  ELSE
  COALESCE(
    NULLIF(
      CASE
        WHEN JSON_VALID(
          ec.classification_notes
        ) THEN
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ec.classification_notes,
              '$.failureMode'
            )
          )
        ELSE NULL
      END,
      ''
    ),

    NULLIF(
      CASE
        WHEN JSON_VALID(
          ec.classification_notes
        ) THEN
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ec.classification_notes,
              '$.failure_mode'
            )
          )
        ELSE NULL
      END,
      ''
    ),

    NULLIF(
      CASE
        WHEN JSON_VALID(
          ec.classification_notes
        ) THEN
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ec.classification_notes,
              '$.modelSuggestion.failureMode'
            )
          )
        ELSE NULL
      END,
      ''
    ),

    NULLIF(
      CASE WHEN cs.status IN ('CONFIRMADA', 'CORRIGIDA') THEN cs.failure_mode ELSE NULL END,
      ''
    ),

    'Não classificado'
  )
  END
`;

/*
  Junções necessárias para FAILURE_MODE_EXPRESSION funcionar.
  `latest_suggestion` pega a sugestão mais recente do ML de
  cada evento.
*/
export const CLASSIFICATION_JOINS = `
  LEFT JOIN event_classifications ec
    ON ec.event_id = e.id

  LEFT JOIN (
    SELECT
      cs0.event_id,
      MAX(cs0.id) AS suggestion_id
    FROM classification_suggestions cs0
    WHERE cs0.model_type = 'ML'
      AND cs0.status IN ('CONFIRMADA', 'CORRIGIDA')
    GROUP BY cs0.event_id
  ) latest
    ON latest.event_id = e.id

  LEFT JOIN classification_suggestions cs
    ON cs.id = latest.suggestion_id
`;

/*
  Campo da classificação oficial gravado pelo revisor em
  `classification_notes` (JSON). A revisão e o histórico
  guardam a decisão só ali, sem preencher `mode_id`.
*/
export function classificationNoteField(
  alias: string,
  key: "failureMode" | "failedComponentCode",
): string {
  return `
    CASE WHEN JSON_VALID(${alias}.classification_notes)
      THEN NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${alias}.classification_notes, '$.${key}')), ''), 'null')
    END
  `;
}

/*
  Origem da falha (OPERACAO x MANUTENCAO).

  event_failure_origin_predictions guarda uma linha por
  evento e versão de modelo; juntar a tabela inteira conta o
  evento uma vez por versão. Esta junção traz só a previsão
  mais recente (`prediction`) e a revisão manual (`review`),
  que tem prioridade sobre o modelo.

  Depende do alias `e` (maintenance_events).
*/
export const FAILURE_ORIGIN_JOINS = `
  LEFT JOIN (
    SELECT
      fop0.event_id,
      MAX(fop0.id) AS prediction_id
    FROM event_failure_origin_predictions fop0
    GROUP BY fop0.event_id
  ) latest_origin
    ON latest_origin.event_id = e.id

  LEFT JOIN event_failure_origin_predictions prediction
    ON prediction.id = latest_origin.prediction_id

  LEFT JOIN event_failure_origin_reviews review
    ON review.event_id = e.id
`;

export const EFFECTIVE_ORIGIN_EXPRESSION = `
  CASE UPPER(TRIM(COALESCE(review.manual_origin, prediction.failure_origin, '')))
    WHEN 'OPERACAO' THEN 'OPERACAO'
    WHEN 'MANUTENCAO' THEN 'MANUTENCAO'
    ELSE 'NAO_CLASSIFICADO'
  END
`;

/*
  Texto de busca dentro de LIKE '%...%'. Sem escapar, "%"
  e "_" digitados pelo usuário viram curingas. A barra é o
  caractere de escape padrão do MySQL.
*/
export function containsLikePattern(
  search: string,
): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function isDateValue(
  value: string | null | undefined,
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/*
  Monta as condições de período. Os parâmetros entram no
  array recebido, na mesma ordem das condições retornadas.
*/
export function buildDateWhere(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  params: Array<string | number>,
): string[] {
  const where: string[] = [];

  if (isDateValue(startDate)) {
    where.push(
      "e.event_date >= ?",
    );

    params.push(startDate);
  }

  if (isDateValue(endDate)) {
    where.push(
      "e.event_date <= ?",
    );

    params.push(endDate);
  }

  return where;
}
