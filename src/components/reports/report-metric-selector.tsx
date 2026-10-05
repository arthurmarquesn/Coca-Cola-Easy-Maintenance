"use client";

import {
  BarChart3,
  ClipboardList,
  Gauge,
  Layers3,
  Table2,
  Target,
  Wrench,
} from "lucide-react";

export type ReportMetric =
  | "SUMMARY"
  | "UNIT_COMPARISON"
  | "PARETO"
  | "JACK_KNIFE"
  | "CRITICALITY"
  | "FAILURE_MODES"
  | "DETAILS";

interface ReportMetricSelectorProps {
  value: ReportMetric[];
  onChange: (
    value: ReportMetric[],
  ) => void;
}

const METRICS: Array<{
  value: ReportMetric;
  title: string;
  description: string;
  icon: typeof Gauge;
}> = [
  {
    value: "SUMMARY",
    title: "Resumo executivo",
    description:
      "KPIs, volume de ocorrências, downtime e indicadores consolidados.",
    icon: Gauge,
  },
  {
    value: "UNIT_COMPARISON",
    title: "Comparativo entre unidades",
    description:
      "Compara falhas, tempo de parada e MTTR das unidades selecionadas.",
    icon: Layers3,
  },
  {
    value: "PARETO",
    title: "Pareto",
    description:
      "Ranking completo por tempo de parada e percentual acumulado.",
    icon: BarChart3,
  },
  {
    value: "JACK_KNIFE",
    title: "Jack-Knife",
    description:
      "Frequência, MTTR e enquadramento de criticidade operacional.",
    icon: Target,
  },
  {
    value: "CRITICALITY",
    title: "Criticidade dos equipamentos",
    description:
      "Distribuição dos eventos por criticidade A, B, C ou não definida.",
    icon: Wrench,
  },
  {
    value: "FAILURE_MODES",
    title: "Modos de falha",
    description:
      "Principais modos de falha classificados no período selecionado.",
    icon: ClipboardList,
  },
  {
    value: "DETAILS",
    title: "Anexo detalhado",
    description:
      "Inclui uma tabela operacional com os eventos que compõem o relatório.",
    icon: Table2,
  },
];

export function ReportMetricSelector({
  value,
  onChange,
}: ReportMetricSelectorProps) {
  const selected =
    new Set(
      value,
    );

  function toggle(
    metric: ReportMetric,
  ) {
    if (
      selected.has(
        metric,
      )
    ) {
      onChange(
        value.filter(
          (
            item,
          ) =>
            item !==
            metric,
        ),
      );

      return;
    }

    onChange([
      ...value,
      metric,
    ]);
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {METRICS.map(
        (
          metric,
        ) => {
          const checked =
            selected.has(
              metric.value,
            );

          const Icon =
            metric.icon;

          return (
            <button
              key={
                metric.value
              }
              type="button"
              onClick={() =>
                toggle(
                  metric.value,
                )
              }
              className={[
                "group flex min-h-[112px] items-start gap-3 rounded-[16px] border p-4 text-left transition-all",
                checked
                  ? "border-[#E9B5B9] bg-accent-primary/5 shadow-[0_6px_20px_rgba(228,30,43,0.05)]"
                  : "border-border-theme bg-surface hover:border-border-theme hover:bg-surface-hover",
              ].join(
                " ",
              )}
              aria-pressed={
                checked
              }
            >
              <span
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-colors",
                  checked
                    ? "bg-[#E41E2B] text-white"
                    : "bg-surface-elevated text-text-secondary group-hover:bg-surface-hover",
                ].join(
                  " ",
                )}
              >
                <Icon
                  size={17}
                  strokeWidth={1.8}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[12px] font-semibold text-text-primary">
                    {metric.title}
                  </span>

                  <span
                    className={[
                      "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      checked
                        ? "border-[#E41E2B] bg-[#E41E2B]"
                        : "border-border-theme bg-surface",
                    ].join(
                      " ",
                    )}
                  >
                    {checked && (
                      <span className="h-2 w-1 rotate-45 border-b-2 border-r-2 border-border-theme" />
                    )}
                  </span>
                </span>

                <span className="mt-1.5 block text-[10px] leading-4 text-text-secondary">
                  {metric.description}
                </span>
              </span>
            </button>
          );
        },
      )}
    </div>
  );
}
