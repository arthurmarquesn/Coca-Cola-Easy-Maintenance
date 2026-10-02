import {
  groupBy,
  round,
  summarize,
} from "../metrics";

import type {
  AnalyticsEvent,
} from "../types";

/* =========================================================
   G11 - CARTÕES DE KPI

   Cada cartão compara o período filtrado com o período
   anterior de mesmo tamanho.

   MTBF não entra: a planilha não traz tempo de operação da
   máquina, e calcular sem esse dado daria um número errado.
========================================================= */

export interface KpiCardData {
  key:
    | "DOWNTIME"
    | "OCCURRENCES"
    | "MTTR"
    | "TOP_EQUIPMENT"
    | "TOP_FAILURE_MODE";

  label: string;

  /* Valor numérico. null nos cartões de texto. */
  value: number | null;

  /* Texto do cartão, usado nos KPIs de "qual foi o maior". */
  text: string | null;

  /* Detalhe secundário, ex.: "1.240,5 min". */
  detail: string | null;

  /*
    Variação % contra o período anterior. null quando não há
    período anterior ou quando a base era zero — nesse caso a
    variação seria infinita e enganaria a leitura.
  */
  changePercentage: number | null;

  /*
    Para estes KPIs, cair é bom. A tela usa isso para escolher
    a cor da seta.
  */
  lowerIsBetter: boolean;
}

export interface KpisResult {
  cards: KpiCardData[];
  hasPreviousPeriod: boolean;
}

function change(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) {
    return null;
  }

  return round(
    ((current - previous) / previous) *
      100,
  );
}

function topLabel(
  events: AnalyticsEvent[],
  keyOf: (
    event: AnalyticsEvent,
  ) => string | null,
) {
  const grouped = groupBy(
    events,
    keyOf,
  );

  return grouped[0] ?? null;
}

export function buildKpis(
  events: AnalyticsEvent[],
  previousEvents: AnalyticsEvent[] = [],
): KpisResult {
  const current = summarize(events);

  const previous = summarize(
    previousEvents,
  );

  const hasPreviousPeriod =
    previousEvents.length > 0;

  const topEquipment = topLabel(
    events,
    (event) =>
      event.equipment?.trim() || null,
  );

  const topFailureMode = topLabel(
    events,
    (event) => event.failureMode,
  );

  /*
    A classe de falha "mais frequente" é por Q, não por
    T(min): é a pergunta que o gestor faz sobre recorrência.
  */
  const mostFrequentFailure = groupBy(
    events,
    (event) => event.failureMode,
  ).sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      a.label.localeCompare(
        b.label,
        "pt-BR",
      ),
  )[0] ?? topFailureMode;

  const cards: KpiCardData[] = [
    {
      key: "DOWNTIME",
      label: "Minutos de parada",
      value: current.downtimeMinutes,
      text: null,
      detail: null,
      changePercentage: hasPreviousPeriod
        ? change(
            current.downtimeMinutes,
            previous.downtimeMinutes,
          )
        : null,
      lowerIsBetter: true,
    },
    {
      key: "OCCURRENCES",
      label: "Número de falhas",
      value: current.occurrences,
      text: null,
      detail: null,
      changePercentage: hasPreviousPeriod
        ? change(
            current.occurrences,
            previous.occurrences,
          )
        : null,
      lowerIsBetter: true,
    },
    {
      key: "MTTR",
      label: "MTTR geral",
      value: current.mttr,
      text: null,
      detail: "minutos por parada",
      changePercentage: hasPreviousPeriod
        ? change(
            current.mttr,
            previous.mttr,
          )
        : null,
      lowerIsBetter: true,
    },
    {
      key: "TOP_EQUIPMENT",
      label: "Máquina mais crítica",
      value: null,
      text:
        topEquipment?.label ?? null,
      detail: topEquipment
        ? `${topEquipment.downtimeMinutes} min · ${topEquipment.occurrences} paradas`
        : null,
      changePercentage: null,
      lowerIsBetter: true,
    },
    {
      key: "TOP_FAILURE_MODE",
      label: "Classe de falha mais frequente",
      value: null,
      text:
        mostFrequentFailure?.label ??
        null,
      detail: mostFrequentFailure
        ? `${mostFrequentFailure.occurrences} ocorrências`
        : null,
      changePercentage: null,
      lowerIsBetter: true,
    },
  ];

  return {
    cards,
    hasPreviousPeriod,
  };
}
