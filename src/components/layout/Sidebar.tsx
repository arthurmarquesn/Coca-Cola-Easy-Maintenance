"use client";

import React from "react";
import { FiltroContexto } from "@/types";
import { ChevronDown } from "lucide-react";

interface SidebarProps {
  filtro: FiltroContexto;
  onFiltroChange: (filtro: Partial<FiltroContexto>) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  filtro,
  onFiltroChange,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = React.useState({
    contexto: true,
    periodo: true,
    analise: true,
    priorizacao: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <>
      {/* Mobile overlay */}
      {!isOpen && (
        <div
          className="fixed inset-0 bg-[var(--surface-overlay)] z-[var(--z-fixed)] md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed md:static
          w-64 h-screen md:h-auto
          bg-[var(--surface-card)]
          border-r border-[var(--border-subtle)]
          overflow-y-auto
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          z-[var(--z-sticky)]
          md:z-auto
        `}
      >
        <div className="p-6 space-y-8">
          {/* CONTEXTO */}
          <section>
            <button
              onClick={() => toggleSection("contexto")}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                Contexto
              </h3>
              <ChevronDown
                size={16}
                className={`text-[var(--text-muted)] transition-transform ${
                  expandedSections.contexto ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {expandedSections.contexto && (
              <div className="space-y-4">
                {/* Planta */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Planta
                  </label>
                  <select
                    value={filtro.planta}
                    onChange={(e) => onFiltroChange({ planta: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Selecionar planta"
                  >
                    <option>São Paulo</option>
                    <option>Rio de Janeiro</option>
                    <option>Minas Gerais</option>
                  </select>
                </div>

                {/* Linha */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Linha
                  </label>
                  <select
                    value={filtro.linha}
                    onChange={(e) => onFiltroChange({ linha: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Selecionar linha"
                  >
                    <option>Linha 01</option>
                    <option>Linha 04</option>
                    <option>Linha 07</option>
                  </select>
                </div>

                {/* Produto */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Produto
                  </label>
                  <select
                    value={filtro.produto}
                    onChange={(e) => onFiltroChange({ produto: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Selecionar produto"
                  >
                    <option>Todos</option>
                    <option>Refrigerante</option>
                    <option>Suco</option>
                  </select>
                </div>
              </div>
            )}
          </section>

          {/* PERÍODO */}
          <section>
            <button
              onClick={() => toggleSection("periodo")}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                Período
              </h3>
              <ChevronDown
                size={16}
                className={`text-[var(--text-muted)] transition-transform ${
                  expandedSections.periodo ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {expandedSections.periodo && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Data inicial
                  </label>
                  <input
                    type="date"
                    value={filtro.dataInicial.toISOString().split("T")[0]}
                    onChange={(e) =>
                      onFiltroChange({
                        dataInicial: new Date(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Data inicial"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Data final
                  </label>
                  <input
                    type="date"
                    value={filtro.dataFinal.toISOString().split("T")[0]}
                    onChange={(e) =>
                      onFiltroChange({ dataFinal: new Date(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Data final"
                  />
                </div>
              </div>
            )}
          </section>

          {/* ANÁLISE */}
          <section>
            <button
              onClick={() => toggleSection("analise")}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                Análise
              </h3>
              <ChevronDown
                size={16}
                className={`text-[var(--text-muted)] transition-transform ${
                  expandedSections.analise ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {expandedSections.analise && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                    Indicador
                  </label>
                  <select
                    value={filtro.indicador}
                    onChange={(e) =>
                      onFiltroChange({ indicador: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                    aria-label="Selecionar indicador"
                  >
                    <option>Tempo de parada</option>
                    <option>Frequência</option>
                    <option>Impacto</option>
                  </select>
                </div>
              </div>
            )}
          </section>

          {/* PRIORIZAÇÃO */}
          <section>
            <button
              onClick={() => toggleSection("priorizacao")}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
                Priorização
              </h3>
              <ChevronDown
                size={16}
                className={`text-[var(--text-muted)] transition-transform ${
                  expandedSections.priorizacao ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {expandedSections.priorizacao && (
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-2 font-medium">
                  Top causas
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={filtro.topCausas}
                  onChange={(e) =>
                    onFiltroChange({ topCausas: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2"
                  aria-label="Número de top causas"
                />
              </div>
            )}
          </section>
        </div>

        {/* Buttons at bottom */}
        <div className="fixed bottom-0 left-0 right-0 md:relative border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 space-y-3">
          <button
            className="w-full px-4 py-2 bg-[var(--color-brand)] text-white text-sm font-medium rounded-md hover:bg-[var(--color-brand-dark)] transition-colors"
            aria-label="Aplicar filtros"
          >
            Aplicar filtros
          </button>
          <button
            className="w-full px-4 py-2 bg-[var(--surface-secondary)] text-[var(--text-primary)] text-sm font-medium rounded-md hover:bg-[var(--color-gray-100)] transition-colors border border-[var(--border-subtle)]"
            aria-label="Limpar filtros"
          >
            Limpar
          </button>
        </div>
      </aside>
    </>
  );
}
