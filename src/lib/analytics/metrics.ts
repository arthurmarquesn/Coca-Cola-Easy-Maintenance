import type {
  AnalyticsEvent,
  LabeledMetrics,
  Metrics,
} from "./types";

/* =========================================================
   MÉTRICAS BÁSICAS

   Funções puras. Recebem ocorrências, devolvem números.
   Sem acesso a banco, para poderem ser testadas.
========================================================= */

export function round(
  value: number,
  digits = 2,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
}

/*
  MTTR = T(min) / Q.

  Q zerado devolve 0 em vez de NaN: sem ocorrência não existe
  tempo médio de reparo.
*/
export function mttr(
  downtimeMinutes: number,
  occurrences: number,
): number {
  if (occurrences <= 0) {
    return 0;
  }

  return round(
    downtimeMinutes / occurrences,
  );
}

export function summarize(
  events: AnalyticsEvent[],
): Metrics {
  const downtimeMinutes =
    events.reduce(
      (total, event) =>
        total + event.downtimeMinutes,
      0,
    );

  return {
    occurrences: events.length,

    downtimeMinutes: round(
      downtimeMinutes,
    ),

    mttr: mttr(
      downtimeMinutes,
      events.length,
    ),
  };
}

/*
  Agrupa as ocorrências por uma chave e calcula Q, T e MTTR de
  cada grupo.

  `keyOf` devolvendo null descarta a ocorrência — use para
  "sem turno informado", por exemplo.

  A ordenação padrão é por T(min) decrescente, que é a leitura
  de Pareto. O desempate por rótulo mantém o resultado estável
  entre execuções.
*/
export function groupBy(
  events: AnalyticsEvent[],
  keyOf: (
    event: AnalyticsEvent,
  ) => string | null,
): LabeledMetrics[] {
  const groups = new Map<
    string,
    { occurrences: number; downtimeMinutes: number }
  >();

  for (const event of events) {
    const key = keyOf(event);

    if (key === null) {
      continue;
    }

    const current =
      groups.get(key) ?? {
        occurrences: 0,
        downtimeMinutes: 0,
      };

    current.occurrences += 1;

    current.downtimeMinutes +=
      event.downtimeMinutes;

    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([label, value]) => ({
      label,

      occurrences: value.occurrences,

      downtimeMinutes: round(
        value.downtimeMinutes,
      ),

      mttr: mttr(
        value.downtimeMinutes,
        value.occurrences,
      ),
    }))
    .sort(
      (a, b) =>
        b.downtimeMinutes -
          a.downtimeMinutes ||
        b.occurrences - a.occurrences ||
        a.label.localeCompare(
          b.label,
          "pt-BR",
        ),
    );
}

/*
  Reduz uma lista grande a `limit` itens, somando o restante
  em "Outras". Sem isso os gráficos de barras ficam ilegíveis
  com dezenas de categorias.
*/
export function withOthers(
  items: LabeledMetrics[],
  limit: number,
  othersLabel = "Outras",
): LabeledMetrics[] {
  if (items.length <= limit) {
    return items;
  }

  const head = items.slice(0, limit);
  const tail = items.slice(limit);

  const downtimeMinutes = tail.reduce(
    (total, item) =>
      total + item.downtimeMinutes,
    0,
  );

  const occurrences = tail.reduce(
    (total, item) =>
      total + item.occurrences,
    0,
  );

  return [
    ...head,
    {
      label: othersLabel,

      occurrences,

      downtimeMinutes: round(
        downtimeMinutes,
      ),

      mttr: mttr(
        downtimeMinutes,
        occurrences,
      ),
    },
  ];
}
