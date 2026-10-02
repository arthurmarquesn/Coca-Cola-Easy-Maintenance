"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { ChartCard } from "./chart-card";

import {
  formatInteger,
  formatPercent,
} from "@/lib/analytics/format";

import type {
  CoverageResult,
  CoverageSlice,
} from "@/lib/analytics/aggregations/coverage";

/* =========================================================
   G2 - COBERTURA DA CLASSIFICAÇÃO AUTOMÁTICA

   Cores validadas para daltonismo nos dois temas. Mesmo
   assim, cada fatia é nomeada na legenda com o número
   absoluto: a identidade nunca depende só da cor.
========================================================= */

const SLICE_COLORS: Record<
  CoverageSlice["key"],
  string
> = {
  CLASSIFIED: "var(--chart-good)",
  UNCLASSIFIED: "var(--chart-bad)",
  NO_OBSERVATION: "var(--chart-neutral)",
};

function CoverageTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: CoverageSlice;
  }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const slice = payload[0].payload;

  return (
    <div className="rounded-[11px] border border-border-theme bg-surface px-3.5 py-2.5 text-[12px] shadow-sm">
      <p className="font-semibold text-text-primary">
        {slice.label}
      </p>

      <p className="mt-1 text-text-secondary">
        {formatInteger(slice.occurrences)}{" "}
        ocorrências ·{" "}
        {formatPercent(slice.percentage)}
      </p>
    </div>
  );
}

export function CoverageChart({
  data,
  subtitle,
}: {
  data: CoverageResult;
  subtitle: string;
}) {
  const slices = data.slices.filter(
    (slice) => slice.occurrences > 0,
  );

  return (
    <ChartCard
      title="Cobertura da classificação automática"
      subtitle={subtitle}
      isEmpty={data.total === 0}
      footnote="“Sem observação preenchida” não é erro do classificador: a coluna de observações veio em branco, então não havia texto para analisar."
    >
      <div className="flex flex-col items-center gap-6 lg:flex-row">
        <div className="relative h-[220px] w-full max-w-[260px] shrink-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <PieChart>
              <Pie
                data={slices}
                dataKey="occurrences"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {slices.map((slice) => (
                  <Cell
                    key={slice.key}
                    fill={
                      SLICE_COLORS[slice.key]
                    }
                  />
                ))}
              </Pie>

              <Tooltip
                content={
                  <CoverageTooltip />
                }
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Número de capa: o indicador do projeto. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-semibold tracking-[-0.03em] text-text-primary">
              {formatPercent(
                data.coveragePercentage,
              )}
            </span>

            <span className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-text-secondary">
              classificadas
            </span>
          </div>
        </div>

        <ul className="w-full space-y-2.5">
          {data.slices.map((slice) => (
            <li
              key={slice.key}
              className="flex items-center gap-3 text-[12.5px]"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    SLICE_COLORS[slice.key],
                }}
              />

              <span className="text-text-primary">
                {slice.label}
              </span>

              <span className="ml-auto whitespace-nowrap font-medium text-text-primary">
                {formatInteger(
                  slice.occurrences,
                )}
              </span>

              <span className="w-[58px] whitespace-nowrap text-right text-text-secondary">
                {formatPercent(
                  slice.percentage,
                )}
              </span>
            </li>
          ))}

          <li className="flex items-center gap-3 border-t border-border-theme pt-2.5 text-[12.5px] font-medium">
            <span className="text-text-primary">
              Total de ocorrências
            </span>

            <span className="ml-auto text-text-primary">
              {formatInteger(data.total)}
            </span>

            <span className="w-[58px]" />
          </li>
        </ul>
      </div>
    </ChartCard>
  );
}
