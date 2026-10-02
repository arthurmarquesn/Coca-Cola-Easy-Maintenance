import { round } from "../metrics";

import type {
  AnalyticsEvent,
} from "../types";

/* =========================================================
   G2 - COBERTURA DA CLASSIFICAÇÃO AUTOMÁTICA

   Indicador de sucesso do projeto de automação.

   Três grupos, mutuamente exclusivos:

   - classificada: o classificador identificou o modo de falha
   - semClassificacao: havia texto em M, mas não deu para
     identificar (precisa de análise manual)
   - semObservacao: a coluna M veio em branco, então não havia
     o que classificar. Separado do anterior de propósito: não
     é falha do classificador.
========================================================= */

export interface CoverageSlice {
  key:
    | "CLASSIFIED"
    | "UNCLASSIFIED"
    | "NO_OBSERVATION";
  label: string;
  occurrences: number;
  percentage: number;
}

export interface CoverageResult {
  slices: CoverageSlice[];
  total: number;

  /* % classificada automaticamente. O número de capa. */
  coveragePercentage: number;
}

function hasObservation(
  event: AnalyticsEvent,
): boolean {
  return Boolean(
    event.observation &&
      event.observation.trim() !== "",
  );
}

export function buildCoverage(
  events: AnalyticsEvent[],
): CoverageResult {
  let classified = 0;
  let unclassified = 0;
  let noObservation = 0;

  for (const event of events) {
    if (!hasObservation(event)) {
      noObservation += 1;
      continue;
    }

    if (event.unclassified) {
      unclassified += 1;
      continue;
    }

    classified += 1;
  }

  const total = events.length;

  const percentageOf = (
    value: number,
  ) =>
    total > 0
      ? round((value / total) * 100)
      : 0;

  const slices: CoverageSlice[] = [
    {
      key: "CLASSIFIED",
      label:
        "Classificada automaticamente",
      occurrences: classified,
      percentage:
        percentageOf(classified),
    },
    {
      key: "UNCLASSIFIED",
      label:
        "Sem Modo de Falha Identificado",
      occurrences: unclassified,
      percentage:
        percentageOf(unclassified),
    },
    {
      key: "NO_OBSERVATION",
      label:
        "Sem observação preenchida",
      occurrences: noObservation,
      percentage:
        percentageOf(noObservation),
    },
  ];

  return {
    slices,
    total,
    coveragePercentage:
      percentageOf(classified),
  };
}
