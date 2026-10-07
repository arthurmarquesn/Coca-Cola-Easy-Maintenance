"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartCard,
  ToggleButton,
} from "./chart-card";

import {
  formatInteger,
  formatMinutes,
  formatPercent,
} from "@/lib/analytics/format";

import type {
  FailureParetoResult,
  ParetoSort,
} from "@/lib/analytics/aggregations/failure-pareto";

/* =========================================================
   G1 - PARETO DE CLASSES DE FALHA

   O eixo direito traz o acumulado da MESMA medida das
   colunas, que é a definição da curva de Pareto. Não são
   duas grandezas diferentes dividindo o gráfico.
========================================================= */

interface FailureParetoChartProps {
  data: FailureParetoResult;
  subtitle: string;
  sort: ParetoSort;
  onSortChange: (sort: ParetoSort) => void;
}

interface TooltipPayloadItem {
  payload: FailureParetoResult["items"][number];
}

function ParetoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
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
        <div className="flex gap-3">
          <dt>Tempo de parada</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatMinutes(
              item.downtimeMinutes,
            )}{" "}
            min
          </dd>
        </div>

        <div className="flex gap-3">
          <dt>Paradas (Q)</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatInteger(
              item.occurrences,
            )}
          </dd>
        </div>

        <div className="flex gap-3">
          <dt>MTTR</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatMinutes(item.mttr)} min
          </dd>
        </div>

        <div className="flex gap-3">
          <dt>Acumulado</dt>
          <dd className="ml-auto font-medium text-text-primary">
            {formatPercent(
              item.cumulativePercentage,
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/*
  Rótulo com o Q da classe no pé de cada coluna, como pedido.

  Lê de `items[index]` em vez do valor da barra, porque ao
  ordenar por tempo a barra representa minutos, e o rótulo
  precisa continuar mostrando a quantidade.

  Some em colunas estreitas ou baixas demais, para os números
  não se sobreporem nem vazarem da barra.
*/
function buildOccurrenceLabel(
  items: FailureParetoResult["items"],
) {
  return function OccurrenceLabel(props: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    index?: number;
  }) {
    const {
      x = 0,
      y = 0,
      width = 0,
      height = 0,
      index,
    } = props;

    const item =
      index === undefined
        ? undefined
        : items[index];

    /*
      O Recharts exige um elemento SVG como retorno, então o
      caso "não cabe o rótulo" devolve um grupo vazio em vez
      de null.
    */
    if (
      !item ||
      width < 22 ||
      height < 18
    ) {
      return <g />;
    }

    return (
      <text
        x={x + width / 2}
        y={y + height - 6}
        textAnchor="middle"
        fill="var(--surface)"
        fontSize={10}
        fontWeight={600}
      >
        {formatInteger(item.occurrences)}
      </text>
    );
  };
}

export function FailureParetoChart({
  data,
  subtitle,
  sort,
  onSortChange,
}: FailureParetoChartProps) {
  const valueKey =
    sort === "occurrences"
      ? "occurrences"
      : "downtimeMinutes";

  return (
    <ChartCard
      title="Pareto de classes de falha"
      subtitle={subtitle}
      isEmpty={data.items.length === 0}
      actions={
        <>
          <ToggleButton
            active={sort === "downtime"}
            onClick={() =>
              onSortChange("downtime")
            }
          >
            Tempo de parada
          </ToggleButton>

          <ToggleButton
            active={
              sort === "occurrences"
            }
            onClick={() =>
              onSortChange("occurrences")
            }
          >
            Quantidade
          </ToggleButton>
        </>
      }
      footnote={
        <>
          O número dentro de cada coluna é a quantidade de
          paradas (Q) da classe. A linha mostra o percentual
          acumulado{" "}
          {sort === "occurrences"
            ? "das paradas"
            : "do tempo de parada"}
          .
        </>
      }
    >
      <div className="h-[380px] sm:h-[430px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <ComposedChart
            data={data.items}
            margin={{
              top: 10,
              right: 12,
              left: 0,
              bottom: 72,
            }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--chart-grid)"
            />

            <XAxis
              dataKey="label"
              interval={0}
              angle={-35}
              textAnchor="end"
              height={76}
              tick={{
                fontSize: 10,
                fill: "var(--text-secondary)",
              }}
              axisLine={{
                stroke: "var(--chart-grid)",
              }}
              tickLine={false}
            />

            <YAxis
              yAxisId="value"
              tick={{
                fontSize: 11,
                fill: "var(--text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) =>
                formatInteger(value)
              }
            >
              <Label
                angle={-90}
                position="insideLeft"
                style={{
                  fontSize: 11,
                  fill: "var(--text-secondary)",
                  textAnchor: "middle",
                }}
                value={
                  sort === "occurrences"
                    ? "Paradas (Q)"
                    : "Minutos de parada"
                }
              />
            </YAxis>

            <YAxis
              yAxisId="cumulative"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{
                fontSize: 11,
                fill: "var(--text-secondary)",
              }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) =>
                `${value}%`
              }
            />

            <Tooltip
              content={<ParetoTooltip />}
              cursor={{
                fill: "var(--surface-elevated)",
              }}
            />

            <Bar
              yAxisId="value"
              dataKey={valueKey}
              fill="var(--chart-bad)"
              radius={[4, 4, 0, 0]}
              maxBarSize={46}
              label={buildOccurrenceLabel(
                data.items,
              )}
            />

            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey="cumulativePercentage"
              stroke="var(--text-primary)"
              strokeWidth={2}
              dot={{
                r: 3,
                fill: "var(--text-primary)",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
