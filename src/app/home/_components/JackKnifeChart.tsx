import {
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import type {
  JackKnifeEntry,
  Quadrant,
} from "../data";

/*
 * Linhas de corte que dividem o gráfico em 4 quadrantes.
 * Os dados mockados já vêm classificados por quadrante; estes
 * valores apenas posicionam visualmente o cruzamento das linhas
 * de referência de forma coerente com essa classificação.
 */
const FAILURE_COUNT_THRESHOLD = 10;
const MTTR_THRESHOLD = 40;

const QUADRANT_STYLES: Record<
  Quadrant,
  { fill: string; label: string; labelClassName: string }
> = {
  critico: {
    fill: "#F59E0B",
    label: "CRÍTICO",
    labelClassName: "left-2 top-2 text-[#B4780A]",
  },
  "critico-cronico": {
    fill: "#F40009",
    label: "CRÍTICO-CRÔNICO",
    labelClassName: "right-2 top-2 font-bold text-[#F40009]",
  },
  conforto: {
    fill: "#16A34A",
    label: "CONFORTO",
    labelClassName: "bottom-2 left-2 text-[#15803D]",
  },
  cronico: {
    fill: "#2563EB",
    label: "CRÔNICO",
    labelClassName: "bottom-2 right-2 text-[#1D4ED8]",
  },
};

const QUADRANTS = Object.keys(
  QUADRANT_STYLES,
) as Quadrant[];

function JackKnifeTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0]
    .payload as JackKnifeEntry;

  return (
    <div className="rounded-[11px] border border-[#E9EBEE] bg-white px-3.5 py-2.5 text-[12px] shadow-sm">
      <p className="font-semibold text-text-title">
        {entry.label}
      </p>

      <p className="mt-1 text-[#7C8087]">
        {entry.failureCount} falhas ·{" "}
        {entry.meanTimeToRepair} min (MTTR)
      </p>
    </div>
  );
}

interface JackKnifeChartProps {
  data: JackKnifeEntry[];
  selectedQuadrant: Quadrant | null;
  onSelectQuadrant: (quadrant: Quadrant) => void;
}

export function JackKnifeChart({
  data,
  selectedQuadrant,
  onSelectQuadrant,
}: JackKnifeChartProps) {
  return (
    <div className="relative h-[320px] sm:h-[380px]">
      {QUADRANTS.map((quadrant) => (
        <span
          key={quadrant}
          className={`pointer-events-none absolute z-10 text-[10px] font-medium tracking-[0.02em] ${QUADRANT_STYLES[quadrant].labelClassName}`}
        >
          {QUADRANT_STYLES[quadrant].label}
        </span>
      ))}

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{
            top: 24,
            right: 16,
            left: 0,
            bottom: 24,
          }}
        >
          <XAxis
            type="number"
            dataKey="failureCount"
            scale="log"
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#7C8087" }}
            axisLine={{ stroke: "#E9EBEE" }}
            tickLine={false}
          />

          <YAxis
            type="number"
            dataKey="meanTimeToRepair"
            tick={{ fontSize: 11, fill: "#7C8087" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          <ZAxis
            type="number"
            dataKey="occurrences"
            range={[80, 600]}
          />

          <ReferenceLine
            x={FAILURE_COUNT_THRESHOLD}
            stroke="#CBCFD4"
            strokeDasharray="5 4"
          />

          <ReferenceLine
            y={MTTR_THRESHOLD}
            stroke="#CBCFD4"
            strokeDasharray="5 4"
          />

          <Tooltip
            content={<JackKnifeTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
          />

          {QUADRANTS.map((quadrant) => {
            const isDimmed =
              selectedQuadrant !== null &&
              selectedQuadrant !== quadrant;

            return (
              <Scatter
                key={quadrant}
                data={data.filter(
                  (entry) =>
                    entry.quadrant === quadrant,
                )}
                fill={QUADRANT_STYLES[quadrant].fill}
                fillOpacity={isDimmed ? 0.25 : 0.85}
                cursor="pointer"
                onClick={() =>
                  onSelectQuadrant(quadrant)
                }
              />
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
