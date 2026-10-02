"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "./chart-card";

import {
  formatInteger,
  formatMinutes,
} from "@/lib/analytics/format";

import type {
  ByLineResult,
} from "@/lib/analytics/aggregations/by-line";

import type {
  LabeledMetrics,
} from "@/lib/analytics/types";

/* =========================================================
   G9 - PERDAS POR LINHA DE PRODUÇÃO

   Clicar numa barra aplica o filtro de Linha aos demais
   gráficos, usando o mesmo filtro que a tela já tem.
========================================================= */

function LineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: LabeledMetrics;
  }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="rounded-[11px] border border-border-theme bg-surface px-3.5 py-2.5 text-[12px] shadow-sm">
      <p className="font-semibold text-text-primary">
        {item.label}
      </p>

      <dl className="mt-1.5 space-y-0.5 text-text-secondary">
        <div className="flex gap-4">
          <dt>Tempo de parada</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatMinutes(
              item.downtimeMinutes,
            )}{" "}
            min
          </dd>
        </div>

        <div className="flex gap-4">
          <dt>Paradas (Q)</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatInteger(
              item.occurrences,
            )}
          </dd>
        </div>

        <div className="flex gap-4">
          <dt>MTTR</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatMinutes(item.mttr)} min
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ByLineChart({
  data,
  subtitle,
  selectedLine,
  onSelectLine,
}: {
  data: ByLineResult;
  subtitle: string;
  selectedLine: string;
  onSelectLine: (line: string) => void;
}) {
  /* 26px por barra mantém os rótulos legíveis. */
  const height = Math.max(
    220,
    data.items.length * 34 + 40,
  );

  return (
    <ChartCard
      title="Perdas por linha de produção"
      subtitle={subtitle}
      isEmpty={data.items.length === 0}
      footnote="Clique em uma barra para filtrar todos os gráficos por aquela linha. Clique de novo para remover o filtro."
    >
      <div style={{ height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart
            data={data.items}
            layout="vertical"
            margin={{
              top: 4,
              right: 60,
              left: 8,
              bottom: 4,
            }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="var(--chart-grid)"
            />

            <XAxis
              type="number"
              tick={{
                fontSize: 11,
                fill: "var(--text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) =>
                formatInteger(value)
              }
            />

            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{
                fontSize: 11,
                fill: "var(--text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              content={<LineTooltip />}
              cursor={{
                fill: "var(--surface-elevated)",
              }}
            />

            <Bar
              dataKey="downtimeMinutes"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              onClick={(
                item: LabeledMetrics,
              ) =>
                onSelectLine(
                  item.label ===
                    selectedLine
                    ? ""
                    : item.label,
                )
              }
              className="cursor-pointer"
            >
              {data.items.map((item) => (
                <Cell
                  key={item.label}
                  fill="var(--chart-bad)"
                  /*
                    A linha filtrada fica opaca e as demais
                    recuam, em vez de trocar de cor: a cor
                    segue a entidade, não o estado.
                  */
                  fillOpacity={
                    selectedLine === "" ||
                    selectedLine ===
                      item.label
                      ? 1
                      : 0.35
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
