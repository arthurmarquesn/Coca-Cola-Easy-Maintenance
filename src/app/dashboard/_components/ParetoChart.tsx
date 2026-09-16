import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ParetoEntry } from "../data";

const TOOLTIP_STYLE = {
  borderRadius: 11,
  border: "1px solid #E9EBEE",
  fontSize: 12,
  color: "#191919",
};

interface ParetoChartProps {
  data: ParetoEntry[];
}

export function ParetoChart({ data }: ParetoChartProps) {
  return (
    <div className="h-[320px] sm:h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{
            top: 8,
            right: 8,
            left: 0,
            bottom: 40,
          }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#E9EBEE"
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#7C8087" }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
            axisLine={{ stroke: "#E9EBEE" }}
            tickLine={false}
          />

          <YAxis
            yAxisId="minutes"
            tick={{ fontSize: 11, fill: "#7C8087" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />

          <YAxis
            yAxisId="percent"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fontSize: 11, fill: "#7C8087" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name) =>
              name === "cumulativePct"
                ? [`${value}%`, "% acumulado"]
                : [`${value} min`, "Minutos"]
            }
          />

          <ReferenceLine
            yAxisId="percent"
            y={80}
            stroke="#D9A404"
            strokeDasharray="5 4"
          />

          <Bar
            yAxisId="minutes"
            dataKey="minutes"
            fill="#F40009"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          />

          <Line
            yAxisId="percent"
            dataKey="cumulativePct"
            stroke="#191919"
            strokeWidth={2}
            dot={{ r: 3, fill: "#191919" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
