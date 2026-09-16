"use client";

import React from "react";
import { ParetoItem } from "@/types";
import { MoreVertical } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

interface ParetoChartProps {
  data: ParetoItem[];
  onSelectItem?: (item: ParetoItem) => void;
  selectedId?: string;
  isLoading?: boolean;
}

export function ParetoChart({
  data,
  onSelectItem,
  selectedId,
  isLoading = false,
}: ParetoChartProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const maxMinutos = Math.max(...data.map((d) => d.minutos));

  if (isLoading) {
    return (
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6 mb-8">
        <div className="h-80 bg-[var(--surface-secondary)] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6 mb-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            Pareto — Tempo de parada
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Principais causas responsáveis pelo impacto
          </p>
        </div>

        <button
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] rounded-md transition-colors"
          aria-label="Opções do gráfico"
        >
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Chart Container */}
      <div className="h-80 relative mb-6">
        <svg
          viewBox="0 0 1200 300"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico Pareto de tempo de parada"
        >
          {/* Grid lines */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={`grid-h-${i}`}
              x1="80"
              y1={250 - (i * 50)}
              x2="1150"
              y2={250 - (i * 50)}
              stroke="var(--border-subtle)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          ))}

          {/* Y-axis labels */}
          {[0, 100, 200, 300, 400].map((val, i) => (
            <text
              key={`y-label-${i}`}
              x="70"
              y={260 - i * 50}
              fontSize="12"
              fill="var(--text-muted)"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {val}
            </text>
          ))}

          {/* Bars and accumulated line */}
          {data.map((item, index) => {
            const barHeight = (item.minutos / maxMinutos) * 200;
            const xPos = 100 + index * (1050 / data.length);
            const barWidth = Math.max((1050 / data.length) * 0.7, 30);

            const isSelected = selectedId === item.id;
            const isHovered = hoveredId === item.id;

            return (
              <g key={item.id}>
                {/* Bar */}
                <rect
                  x={xPos - barWidth / 2}
                  y={250 - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill={
                    isSelected
                      ? "var(--color-brand)"
                      : isHovered
                        ? "var(--color-brand-light)"
                        : "var(--color-brand)"
                  }
                  opacity={isSelected || isHovered ? 1 : 0.7}
                  className="transition-all cursor-pointer hover:opacity-100"
                  onClick={() => onSelectItem?.(item)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.causa}: ${item.minutos} minutos`}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectItem?.(item);
                    }
                  }}
                />

                {/* Label */}
                <text
                  x={xPos}
                  y="270"
                  fontSize="12"
                  fill="var(--text-primary)"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {item.label}
                </text>
              </g>
            );
          })}

          {/* 80% Reference line */}
          <line
            x1="80"
            y1={250 - (0.8 * 200)}
            x2="1150"
            y2={250 - (0.8 * 200)}
            stroke="var(--color-warning)"
            strokeWidth="2"
            strokeDasharray="4,4"
          />

          <text
            x="1160"
            y={250 - (0.8 * 200)}
            fontSize="11"
            fill="var(--color-warning)"
            dominantBaseline="middle"
          >
            80%
          </text>
        </svg>

        {/* Tooltip overlay */}
        {(hoveredId || selectedId) && (
          <div className="absolute top-4 right-4 bg-gray-900 text-white px-3 py-2 rounded text-xs pointer-events-none">
            <div className="font-semibold">
              {data.find((d) => d.id === (selectedId || hoveredId))?.causa}
            </div>
            <div className="text-gray-300">
              {data.find((d) => d.id === (selectedId || hoveredId))?.minutos} min
            </div>
            <div className="text-gray-400 text-xs">
              {data
                .find((d) => d.id === (selectedId || hoveredId))
                ?.percentual.toFixed(1)}
              % do total
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-4">
        <span>{data.length} causas analisadas</span>
        <span>•</span>
        <span>linha acumulada</span>
        <span>•</span>
        <span>
          referência <span className="text-[var(--color-warning)]">80%</span>
        </span>
      </div>
    </div>
  );
}
