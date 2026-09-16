"use client";

import React, { useState } from "react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { OperationalStatus } from "@/components/layout/OperationalStatus";
import { KPIGrid } from "@/components/kpi/KPICard";
import { ParetoChart } from "@/components/charts/ParetoChart";
import { JackKnifeChart } from "@/components/charts/JackKnifeChart";
import { PriorityPanel } from "@/components/layout/PriorityPanel";
import { mockDashboardData } from "@/lib/mockData";
import { DashboardState, FiltroContexto, ParetoItem, JackKnifePoint, ProblemaEmAcao } from "@/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardState>(mockDashboardData);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPareto, setSelectedPareto] = useState<string | undefined>();
  const [selectedJackKnife, setSelectedJackKnife] = useState<string | undefined>();
  const [selectedPriority, setSelectedPriority] = useState<string | undefined>();

  const handleFiltroChange = (novos: Partial<FiltroContexto>) => {
    setData((prev) => ({
      ...prev,
      filtro: { ...prev.filtro, ...novos },
    }));
  };

  const formatUpdateTime = (date: Date) => {
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes === 0) return "agora";
    if (diffMinutes === 1) return "1 min atrás";
    if (diffMinutes < 60) return `${diffMinutes} min atrás`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return "1 hora atrás";
    if (diffHours < 24) return `${diffHours}h atrás`;

    return "mais de 1 dia";
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-background)]">
      {/* Header */}
      <GlobalHeader
        planta={data.filtro.planta}
        linha={data.filtro.linha}
        status={data.operacao.status}
        ultimaAtualizacao={data.operacao.ultimaAtualizacao}
      />

      {/* Main layout: Sidebar + Content + Priority Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:block md:w-64 md:border-r md:border-[var(--border-subtle)] md:overflow-y-auto md:bg-[var(--surface-card)]">
          <Sidebar
            filtro={data.filtro}
            onFiltroChange={handleFiltroChange}
            isOpen={true}
          />
        </div>

        {/* Mobile sidebar toggle */}
        <div className="md:hidden absolute top-20 left-4 z-40">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-md"
            aria-label="Abrir filtros"
          >
            ☰
          </button>
        </div>

        {/* Mobile sidebar */}
        <div className="md:hidden">
          <Sidebar
            filtro={data.filtro}
            onFiltroChange={handleFiltroChange}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {/* Page Title */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
                  Confiabilidade operacional
                </h1>
                <p className="text-base text-[var(--text-muted)]">
                  Visão consolidada das principais causas de parada
                </p>
              </div>

              <div className="text-sm text-[var(--text-muted)] text-right">
                {new Date(data.filtro.dataInicial).toLocaleDateString("pt-BR")}
                {" — "}
                {new Date(data.filtro.dataFinal).toLocaleDateString("pt-BR")}
              </div>
            </div>

            {/* Operational Status Banner */}
            <OperationalStatus
              operacao={data.operacao}
              formatUpdateTime={formatUpdateTime}
            />

            {/* KPIs Grid */}
            <KPIGrid kpis={data.kpis} isLoading={data.isLoading} />

            {/* Pareto Chart */}
            <ParetoChart
              data={data.pareto}
              onSelectItem={(item) => setSelectedPareto(item.id)}
              selectedId={selectedPareto}
              isLoading={data.isLoading}
            />

            {/* Jack Knife Chart */}
            <JackKnifeChart
              data={data.jackKnife}
              onSelectPoint={(point) => setSelectedJackKnife(point.id)}
              selectedId={selectedJackKnife}
              isLoading={data.isLoading}
            />
          </div>
        </main>

        {/* Right Priority Panel - Desktop only */}
        <div className="hidden xl:block w-80 border-l border-[var(--border-subtle)] bg-[var(--surface-card)] overflow-y-auto">
          <div className="p-6">
            <PriorityPanel
              problemas={data.problemasEmAcao}
              onSelectProblem={(problema) => setSelectedPriority(problema.id)}
              selectedId={selectedPriority}
              isLoading={data.isLoading}
            />
          </div>
        </div>
      </div>

      {/* Mobile Priority Panel - Appears below main content */}
      <div className="md:hidden border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 max-h-80 overflow-y-auto">
        <PriorityPanel
          problemas={data.problemasEmAcao}
          onSelectProblem={(problema) => setSelectedPriority(problema.id)}
          selectedId={selectedPriority}
          isLoading={data.isLoading}
        />
      </div>
    </div>
  );
}