"use client";

import type { ReactNode } from "react";

/* =========================================================
   MOLDURA PADRÃO DOS GRÁFICOS COMPLEMENTARES

   Mesmo recorte visual das seções de Pareto e Jack-Knife já
   existentes na tela de Confiabilidade.
========================================================= */

interface ChartCardProps {
  title: string;

  /* Planta, linha e período. Exigido em todo gráfico. */
  subtitle: string;

  /* Alternâncias e seletores do gráfico. */
  actions?: ReactNode;

  footnote?: ReactNode;

  /* true mostra a mensagem de "sem dados" no lugar do gráfico. */
  isEmpty?: boolean;

  emptyMessage?: string;

  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  footnote,
  isEmpty = false,
  emptyMessage = "Nenhuma ocorrência encontrada para os filtros selecionados.",
  children,
}: ChartCardProps) {
  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-border-theme bg-surface transition-colors">
      <div className="flex flex-col gap-3 border-b border-border-theme px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-text-primary">
            {title}
          </h2>

          <p className="mt-1 text-[11px] text-text-secondary">
            {subtitle}
          </p>
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {isEmpty ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-text-secondary">
            {emptyMessage}
          </div>
        ) : (
          children
        )}

        {!isEmpty && footnote && (
          <p className="mt-4 text-[11px] leading-5 text-text-secondary">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}

/* Botão de alternância usado nos gráficos com dois modos. */
export function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[8px] border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
        active
          ? "border-accent-primary bg-accent-primary text-white"
          : "border-border-theme text-text-secondary hover:bg-surface-elevated"
      }`}
    >
      {children}
    </button>
  );
}
