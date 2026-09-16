"use client";

import React from "react";
import { KPI } from "@/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

interface KPICardProps {
  kpi: KPI;
}

export function KPICard({ kpi }: KPICardProps) {
  const getStatusColor = () => {
    switch (kpi.status) {
      case "critical":
        return "var(--color-error)";
      case "warning":
        return "var(--color-warning)";
      default:
        return "var(--color-success)";
    }
  };

  const getTrendIcon = () => {
    if (!kpi.trend) return null;

    switch (kpi.trend) {
      case "up":
        return (
          <TrendingUp
            size={14}
            className="text-[var(--color-error)]"
            aria-label="Tendência crescente"
          />
        );
      case "down":
        return (
          <TrendingDown
            size={14}
            className="text-[var(--color-success)]"
            aria-label="Tendência decrescente"
          />
        );
      case "stable":
        return (
          <Minus
            size={14}
            className="text-[var(--color-gray-500)]"
            aria-label="Tendência estável"
          />
        );
      default:
        return null;
    }
  };

  const borderClass = kpi.isCritical
    ? "border-l-4 border-l-[var(--color-brand)]"
    : "";

  return (
    <Tooltip content={kpi.description || ""} position="top">
      <div
        className={`bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-5 ${borderClass} hover:shadow-sm transition-shadow`}
      >
        {/* Header: Label + Status indicator */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {kpi.label}
          </h3>

          {kpi.isCritical && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getStatusColor() }}
              aria-label={`Crítico: ${kpi.label}`}
            />
          )}
        </div>

        {/* Main value */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-[var(--text-primary)]">
              {kpi.value}
            </span>
            {kpi.unit && (
              <span className="text-xs text-[var(--text-muted)] font-medium">
                {kpi.unit}
              </span>
            )}
          </div>
        </div>

        {/* Variation + Trend or Description */}
        <div className="flex items-center justify-between">
          {kpi.variation !== undefined && (
            <div className="flex items-center gap-2">
              {getTrendIcon()}
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    kpi.trend === "up"
                      ? "var(--color-error)"
                      : kpi.trend === "down"
                        ? "var(--color-success)"
                        : "var(--color-gray-500)",
                }}
              >
                {kpi.trend === "up" ? "+" : ""}
                {kpi.variation}%
              </span>
            </div>
          )}

          {kpi.description && !kpi.variation && (
            <p className="text-xs text-[var(--text-muted)]">
              {kpi.description}
            </p>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

interface KPIGridProps {
  kpis: KPI[];
  isLoading?: boolean;
}

export function KPIGrid({ kpis, isLoading = false }: KPIGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-5 animate-pulse"
          >
            <div className="h-4 bg-[var(--border-subtle)] rounded w-1/3 mb-4" />
            <div className="h-10 bg-[var(--border-subtle)] rounded w-2/3 mb-3" />
            <div className="h-4 bg-[var(--border-subtle)] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map((kpi) => (
        <KPICard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}
