import { groupBy } from "../metrics";

import type {
  AnalyticsEvent,
  LabeledMetrics,
} from "../types";

/* =========================================================
   G9 - PERDAS POR LINHA DE PRODUÇÃO
========================================================= */

export const UNKNOWN_LINE_LABEL =
  "Linha não informada";

export interface ByLineResult {
  items: LabeledMetrics[];
  totalDowntimeMinutes: number;
}

export function buildByLine(
  events: AnalyticsEvent[],
): ByLineResult {
  const items = groupBy(
    events,
    (event) => {
      const line =
        event.line?.trim();

      return line
        ? line
        : UNKNOWN_LINE_LABEL;
    },
  );

  const totalDowntimeMinutes =
    items.reduce(
      (total, item) =>
        total + item.downtimeMinutes,
      0,
    );

  return {
    items,
    totalDowntimeMinutes,
  };
}
