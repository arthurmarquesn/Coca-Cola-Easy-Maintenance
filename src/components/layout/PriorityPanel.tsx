"use client";

import React from "react";
import { ProblemaEmAcao } from "@/types";
import { ChevronRight, AlertCircle, AlertTriangle } from "lucide-react";

interface PriorityPanelProps {
  problemas: ProblemaEmAcao[];
  onSelectProblem?: (problema: ProblemaEmAcao) => void;
  selectedId?: string;
  isLoading?: boolean;
}

export function PriorityPanel({
  problemas,
  onSelectProblem,
  selectedId,
  isLoading = false,
}: PriorityPanelProps) {
  const getImpactoColor = (impacto: string) => {
    switch (impacto) {
      case "critico":
        return "var(--color-error)";
      case "alto":
        return "var(--color-warning)";
      case "medio":
        return "var(--color-info)";
      default:
        return "var(--color-gray-500)";
    }
  };

  const getImpactoLabel = (impacto: string) => {
    switch (impacto) {
      case "critico":
        return "Crítico";
      case "alto":
        return "Alto";
      case "medio":
        return "Médio";
      default:
        return "Baixo";
    }
  };

  const getImpactoIcon = (impacto: string) => {
    switch (impacto) {
      case "critico":
        return <AlertCircle size={16} />;
      case "alto":
        return <AlertTriangle size={16} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6 h-full">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 pb-4 border-b border-[var(--border-subtle)]">
              <div className="h-4 bg-[var(--border-subtle)] rounded w-1/2 animate-pulse" />
              <div className="h-3 bg-[var(--border-subtle)] rounded w-3/4 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg p-6 h-full sticky top-24">
      {/* Header */}
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6">
        Prioridade Operacional
      </h2>

      {/* Items count */}
      <p className="text-xs text-[var(--text-muted)] mb-6">
        {problemas.length} itens requerem atenção
      </p>

      {/* Items */}
      <div className="space-y-4">
        {problemas.map((problema, index) => {
          const isSelected = selectedId === problema.id;

          return (
            <button
              key={problema.id}
              onClick={() => onSelectProblem?.(problema)}
              className={`
                w-full text-left p-4 rounded-lg border transition-all
                ${
                  isSelected
                    ? "bg-[var(--surface-secondary)] border-[var(--color-brand)]"
                    : "bg-[var(--surface-card)] border-[var(--border-subtle)] hover:border-[var(--border-default)]"
                }
              `}
            >
              {/* Position */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <span
                  className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider"
                  aria-label={`Item ${index + 1}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>

                {isSelected && (
                  <ChevronRight
                    size={16}
                    className="text-[var(--color-brand)] flex-shrink-0"
                  />
                )}
              </div>

              {/* Código */}
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                {problema.codigo}
              </h3>

              {/* Descrição */}
              {problema.descricao && (
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  {problema.descricao}
                </p>
              )}

              {/* Minutos + Impacto */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {problema.minutos} min
                </span>

                <div
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                  style={{
                    backgroundColor: `${getImpactoColor(problema.impacto)}15`,
                    color: getImpactoColor(problema.impacto),
                  }}
                >
                  {getImpactoIcon(problema.impacto)}
                  {getImpactoLabel(problema.impacto)}
                </div>
              </div>

              {/* Frequência if available */}
              {problema.frequencia && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {problema.frequencia} ocorrências
                </p>
              )}

              {/* Action arrow */}
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-xs font-medium text-[var(--color-brand)] inline-flex items-center gap-1 group">
                  Ver análise{" "}
                  <ChevronRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
