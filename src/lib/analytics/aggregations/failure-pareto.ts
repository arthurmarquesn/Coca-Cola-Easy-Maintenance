import {
  groupBy,
  round,
  withOthers,
} from "../metrics";

import type {
  AnalyticsEvent,
} from "../types";

/* =========================================================
   G1 - PARETO DE CLASSES DE FALHA

   Diferença para o Pareto já existente: aqui o eixo X são as
   CLASSES DE FALHA, não as máquinas.
========================================================= */

export type ParetoSort =
  | "downtime"
  | "occurrences";

export interface FailureParetoItem {
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;

  /* Participação do item no total, em %. */
  percentage: number;

  /* Acumulado até este item, em %. Base da curva de Pareto. */
  cumulativePercentage: number;
}

export interface FailureParetoResult {
  items: FailureParetoItem[];
  totalOccurrences: number;
  totalDowntimeMinutes: number;
  sort: ParetoSort;
}

const DEFAULT_LIMIT = 12;

export function buildFailurePareto(
  events: AnalyticsEvent[],
  options: {
    sort?: ParetoSort;
    limit?: number;
  } = {},
): FailureParetoResult {
  const sort =
    options.sort ?? "downtime";

  const limit =
    options.limit ?? DEFAULT_LIMIT;

  const grouped = groupBy(
    events,
    (event) => event.failureMode,
  );

  /*
    groupBy já ordena por T(min). Quando o usuário escolhe
    ordenar por Q, reordenamos antes de cortar o top N, senão
    o "Outras" juntaria os itens errados.
  */
  const ordered =
    sort === "occurrences"
      ? [...grouped].sort(
          (a, b) =>
            b.occurrences -
              a.occurrences ||
            b.downtimeMinutes -
              a.downtimeMinutes ||
            a.label.localeCompare(
              b.label,
              "pt-BR",
            ),
        )
      : grouped;

  const items = withOthers(
    ordered,
    limit,
  );

  const totalDowntimeMinutes =
    grouped.reduce(
      (total, item) =>
        total + item.downtimeMinutes,
      0,
    );

  const totalOccurrences =
    grouped.reduce(
      (total, item) =>
        total + item.occurrences,
      0,
    );

  /*
    O acumulado segue o critério escolhido: ordenando por Q, a
    curva acumula Q. Misturar os dois faria a linha descer.
  */
  const total =
    sort === "occurrences"
      ? totalOccurrences
      : totalDowntimeMinutes;

  let running = 0;

  const withPercentages =
    items.map((item) => {
      const value =
        sort === "occurrences"
          ? item.occurrences
          : item.downtimeMinutes;

      running += value;

      return {
        ...item,

        percentage:
          total > 0
            ? round(
                (value / total) * 100,
              )
            : 0,

        cumulativePercentage:
          total > 0
            ? round(
                (running / total) * 100,
              )
            : 0,
      };
    });

  return {
    items: withPercentages,

    totalOccurrences,

    totalDowntimeMinutes: round(
      totalDowntimeMinutes,
    ),

    sort,
  };
}
