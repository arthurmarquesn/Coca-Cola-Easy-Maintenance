"use client";

import React from "react";
import Image from "next/image";
import { Clock, Bell, User } from "lucide-react";

interface GlobalHeaderProps {
  planta: string;
  linha: string;
  status: "normal" | "atencao" | "critico" | "indisponivel";
  ultimaAtualizacao: Date;
}

export function GlobalHeader({
  planta,
  linha,
  status,
  ultimaAtualizacao,
}: GlobalHeaderProps) {
  const getStatusColor = () => {
    switch (status) {
      case "normal":
        return "var(--color-success)";
      case "atencao":
        return "var(--color-warning)";
      case "critico":
        return "var(--color-error)";
      default:
        return "var(--color-gray-500)";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "normal":
        return "Operação normal";
      case "atencao":
        return "Atenção necessária";
      case "critico":
        return "Situação crítica";
      default:
        return "Indisponível";
    }
  };

  const formatUpdateTime = (date: Date) => {
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes === 0) return "Agora";
    if (diffMinutes === 1) return "1 min atrás";
    if (diffMinutes < 60) return `${diffMinutes} min atrás`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return "1 hora atrás";
    if (diffHours < 24) return `${diffHours}h atrás`;

    return date.toLocaleDateString("pt-BR");
  };

  return (
    <header className="sticky top-0 z-[var(--z-fixed)] border-b border-[var(--border-subtle)] bg-[var(--surface-card)] h-16 flex items-center justify-between px-6 gap-4">
      {/* Left: Logo and Title */}
      <div className="flex items-center gap-4 min-w-0 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={32}
            height={32}
            className="w-8 h-8 object-contain"
          />

          <div className="flex flex-col gap-0">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              Easy Maintenance
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              {planta} • {linha}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Status and User */}
      <div className="flex items-center gap-6">
        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getStatusColor() }}
              aria-label={`Status: ${getStatusText()}`}
            />
            <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
              {getStatusText()}
            </span>
          </div>

          <div className="text-xs text-[var(--text-muted)] flex items-center gap-1 whitespace-nowrap">
            <Clock size={14} />
            {formatUpdateTime(ultimaAtualizacao)}
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-[var(--border-subtle)]" />

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Notificações"
          >
            <Bell size={18} />
          </button>

          <button
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Perfil do usuário"
          >
            <User size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
