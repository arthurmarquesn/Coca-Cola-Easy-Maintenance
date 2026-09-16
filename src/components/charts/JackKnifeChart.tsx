"use client";

import React from "react";
import { JackKnifePoint } from "@/types";
import { MoreVertical } from "lucide-react";

interface JackKnifeChartProps {
  data: JackKnifePoint[];
  onSelectPoint?: (point: JackKnifePoint) => void;
  selectedId?: string;
  isLoading?: boolean;
}

export function JackKnifeChart({
  data,
  onSelectPoint,
  selectedId,
  isLoading = false,
}: JackKnifeChartProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const maxFreq = Math.max(...data.map((d) => d.frequencia));
  const maxImpact = Math.max(...data.map((d) => d.impacto));

  const medianFreq = maxFreq / 2;
  const medianImpact = maxImpact / 2;

  if (isLoading) {
    return (
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6">
        <div className="h-80 bg-[var(--surface-secondary)] rounded animate-pulse" />
      </div>
    );
  }

  const normalizeX = (freq: number) => 100 + (freq / maxFreq) * 800;
  const normalizeY = (impact: number) => 250 - (impact / maxImpact) * 200;

  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            Jack Knife — Priorização das causas
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Identificação de causas com maior impacto e frequência
          </p>
        </div>

        <button
          className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] rounded-md transition-colors"
          aria-label="Opções do gráfico"
        >
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Chart */}
      <div className="h-80 relative mb-6">
        <svg
          viewBox="0 0 1000 300"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico Jack Knife de priorização de causas"
        >
          {/* Grid */}
          {[0, 1, 2, 3, 4].map((i) => (
            <React.Fragment key={`grid-${i}`}>
              <line
                x1="100"
                y1={250 - i * 50}
                x2="900"
                y2={250 - i * 50}
                stroke="var(--border-subtle)"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.5"
              />
              <line
                x1={100 + i * 200}
                y1="50"
                x2={100 + i * 200}
                y2="250"
                stroke="var(--border-subtle)"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.5"
              />
            </React.Fragment>
          ))}

          {/* Axes */}
          <line
            x1="100"
            y1="250"
            x2="900"
            y2="250"
            stroke="var(--text-muted)"
            strokeWidth="2"
          />
          <line
            x1="100"
            y1="50"
            x2="100"
            y2="250"
            stroke="var(--text-muted)"
            strokeWidth="2"
          />

          {/* Quadrant lines (median) */}
          <line
            x1={normalizeX(medianFreq)}
            y1="50"
            x2={normalizeX(medianFreq)}
            y2="250"
            stroke="var(--color-warning)"
            strokeWidth="2"
            opacity="0.3"
          />
          <line
            x1="100"
            y1={normalizeY(medianImpact)}
            x2="900"
            y2={normalizeY(medianImpact)}
            stroke="var(--color-warning)"
            strokeWidth="2"
            opacity="0.3"
          />

          {/* Labels */}
          <text
            x="900"
            y="275"
            fontSize="12"
            fill="var(--text-muted)"
            textAnchor="middle"
            fontWeight="600"
          >
            FREQUÊNCIA →
          </text>

          <text
            x="75"
            y="50"
            fontSize="12"
            fill="var(--text-muted)"
            textAnchor="middle"
            fontWeight="600"
            transform="rotate(-90 75 50)"
          >
            IMPACTO ↑
          </text>

          {/* Data points */}
          {data.map((point) => {
            const x = normalizeX(point.frequencia);
            const y = normalizeY(point.impacto);
            const isSelected = selectedId === point.id;
            const isHovered = hoveredId === point.id;

            const quadrantColor =
              point.quadrante === "altoimp-altafreq"
                ? "var(--color-error)"
                : point.quadrante === "altoimp-baixafreq"
                  ? "var(--color-warning)"
                  : point.quadrante === "baixoimp-altafreq"
                    ? "var(--color-info)"
                    : "var(--color-gray-400)";

            return (
              <g key={point.id}>
                {/* Circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected || isHovered ? 8 : 6}
                  fill={quadrantColor}
                  opacity={isSelected || isHovered ? 1 : 0.8}
                  className="cursor-pointer transition-all"
                  onClick={() => onSelectPoint?.(point)}
                  onMouseEnter={() => setHoveredId(point.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    filter: isHovered
                      ? "drop-shadow(0 0 4px rgba(0,0,0,0.2))"
                      : "none",
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${point.causa}: frequência ${point.frequencia}, impacto ${point.impacto} minutos`}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectPoint?.(point);
                    }
                  }}
                />

                {/* Label */}
                {(isSelected || isHovered) && (
                  <text
                    x={x}
                    y={y - 12}
                    fontSize="12"
                    fill="var(--text-primary)"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {point.causa}
                  </text>
                )}
              </g>
            );
          })}

          {/* Legend */}
          <text
            x="100"
            y="25"
            fontSize="11"
            fill="var(--color-error)"
            fontWeight="600"
          >
            ● Alto Impacto / Alta Frequência
          </text>
        </svg>

        {/* Tooltip */}
        {(hoveredId || selectedId) && (
          <div className="absolute bottom-4 left-4 bg-gray-900 text-white px-3 py-2 rounded text-xs pointer-events-none">
            {(() => {
              const point = data.find((d) => d.id === (selectedId || hoveredId));
              return (
                <>
                  <div className="font-semibold">{point?.causa}</div>
                  <div className="text-gray-300">{point?.frequencia} ocorrências</div>
                  <div className="text-gray-400">{point?.minutos} minutos</div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
