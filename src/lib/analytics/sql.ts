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
      cs.failure_mode,
      ''
    ),

    'Não classificado'
  )
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
    GROUP BY cs0.event_id
  ) latest
    ON latest.event_id = e.id

  LEFT JOIN classification_suggestions cs
    ON cs.id = latest.suggestion_id
`;

export function isDateValue(
  value: string | null | undefined,
): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      ),
  );
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
