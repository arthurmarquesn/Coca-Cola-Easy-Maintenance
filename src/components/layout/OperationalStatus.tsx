"use client";

import React from "react";
import { Operacao } from "@/types";
import { AlertTriangle, AlertCircle } from "lucide-react";

interface OperationalStatusProps {
  operacao: Operacao;
  formatUpdateTime: (date: Date) => string;
}

export function OperationalStatus({
  operacao,
  formatUpdateTime,
}: OperationalStatusProps) {
  const getStatusColor = () => {
    switch (operacao.status) {
      case "normal":
        return "#16a34a";
      case "atencao":
        return "#f59e0b";
      case "critico":
        return "#dc2626";
      default:
        return "#6b7280";
    }
  };

  const getStatusText = () => {
    switch (operacao.status) {
      case "normal":
        return "OPERAÇÃO ESTÁVEL";
      case "atencao":
        return "OPERAÇÃO COM ATENÇÃO";
      case "critico":
        return "SITUAÇÃO CRÍTICA";
      default:
        return "OPERAÇÃO INDISPONÍVEL";
    }
  };

  const getIcon = () => {
    if (operacao.status === "critico") {
      return <AlertCircle size={18} />;
    }
    if (operacao.status === "atencao") {
      return <AlertTriangle size={18} />;
    }
    return null;
  };

  return (
    <div className="bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: getStatusColor() }}
            aria-label={`Status: ${getStatusText()}`}
          />

          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {getStatusText()}
            </h2>

            <p className="text-xs text-[var(--text-muted)] mt-2">
              {operacao.ocorrenciasCriticas} ocorrências críticas identificadas
            </p>

            {operacao.ocorrenciasParaPriorizar > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {operacao.ocorrenciasParaPriorizar} necessitam de priorização
                imediata
              </p>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs text-[var(--text-muted)]">
            Atualizado {formatUpdateTime(operacao.ultimaAtualizacao)}
          </p>
        </div>
      </div>
    </div>
  );
}
