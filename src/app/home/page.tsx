"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { ChartPanel } from "./_components/ChartPanel";
import { DashboardHeader } from "./_components/DashboardHeader";
import { FilterChip } from "./_components/FilterChip";
import { FilterSidebar } from "./_components/FilterSidebar";
import { JackKnifeChart } from "./_components/JackKnifeChart";
import { KpiCard } from "./_components/KpiCard";
import { ParetoChart } from "./_components/ParetoChart";

import {
  getReliabilityData,
  type AnalysisType,
  type Quadrant,
  type ReliabilityDataset,
} from "./data";

const DEFAULT_ANALYSIS_TYPE: AnalysisType = "equipamentos";
const DEFAULT_PERIOD = "30d";
const DEFAULT_UNIT = "all";
const DEFAULT_LINE = "all";
const DEFAULT_TURNO = "all";
const DEFAULT_EQUIPAMENTO = "all";
const DEFAULT_SISTEMA = "all";
const DEFAULT_SUBSISTEMA = "all";
const DEFAULT_TOP_N = 10;

const PERIOD_CHIP_LABELS: Record<string, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

const QUADRANT_CHIP_LABELS: Record<Quadrant, string> = {
  critico: "Crítico",
  "critico-cronico": "Crítico-crônico",
  conforto: "Conforto",
  cronico: "Crônico",
};

function formatThousands(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatCompact(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return value.toString();
}

export default function DashboardPage() {
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEntering(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const [dataset, setDataset] =
    useState<ReliabilityDataset | null>(null);

  const [analysisType, setAnalysisType] = useState(
    DEFAULT_ANALYSIS_TYPE,
  );
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [line, setLine] = useState(DEFAULT_LINE);
  const [turno, setTurno] = useState(DEFAULT_TURNO);
  const [equipamento, setEquipamento] = useState(
    DEFAULT_EQUIPAMENTO,
  );
  const [sistema, setSistema] = useState(DEFAULT_SISTEMA);
  const [subsistema, setSubsistema] = useState(
    DEFAULT_SUBSISTEMA,
  );
  const [topN, setTopN] = useState(DEFAULT_TOP_N);

  const [selectedQuadrant, setSelectedQuadrant] =
    useState<Quadrant | null>(null);

  useEffect(() => {
    let cancelled = false;

    getReliabilityData({ analysisType }).then(
      (result) => {
        if (!cancelled) {
          setDataset(result);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [analysisType]);

  const visiblePareto = useMemo(() => {
    if (!dataset) {
      return [];
    }

    return dataset.pareto.slice(0, topN);
  }, [dataset, topN]);

  const unitLabel =
    dataset?.filterOptions.units.find(
      (option) => option.value === unit,
    )?.label ?? "Todas as unidades";

  const lineLabel =
    dataset?.filterOptions.lines.find(
      (option) => option.value === line,
    )?.label ?? "Todas as linhas";

  const turnoLabel =
    dataset?.filterOptions.turnos.find(
      (option) => option.value === turno,
    )?.label ?? "Todos os turnos";

  const equipamentoLabel = dataset?.filterOptions.equipamentos.find(
    (option) => option.value === equipamento,
  )?.label;

  const sistemaLabel = dataset?.filterOptions.sistemas.find(
    (option) => option.value === sistema,
  )?.label;

  const subsistemaLabel = dataset?.filterOptions.subsistemas.find(
    (option) => option.value === subsistema,
  )?.label;

  function formatCustomDate(value: string): string {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const periodChipLabel =
    period === "custom"
      ? customFrom && customTo
        ? `${formatCustomDate(customFrom)} - ${formatCustomDate(customTo)}`
        : "Personalizado"
      : (PERIOD_CHIP_LABELS[period] ?? period);

  function clearAll() {
    setPeriod(DEFAULT_PERIOD);
    setCustomFrom("");
    setCustomTo("");
    setUnit(DEFAULT_UNIT);
    setLine(DEFAULT_LINE);
    setTurno(DEFAULT_TURNO);
    setEquipamento(DEFAULT_EQUIPAMENTO);
    setSistema(DEFAULT_SISTEMA);
    setSubsistema(DEFAULT_SUBSISTEMA);
    setTopN(DEFAULT_TOP_N);
    setSelectedQuadrant(null);
  }

  function toggleQuadrant(quadrant: Quadrant) {
    setSelectedQuadrant((current) =>
      current === quadrant ? null : quadrant,
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F6F7F8]">
      {/* Continuação da transição vinda do login */}

      <div
        className={
          entering
            ? "dashboard-transition"
            : "dashboard-transition dashboard-transition-hide"
        }
        aria-hidden="true"
      >
        <div className="dashboard-transition-logo">
          <Image
            src="/logo.webp"
            alt=""
            width={240}
            height={110}
            className="h-auto w-[190px] object-contain brightness-0 invert"
          />
        </div>
      </div>

      {/* Conteúdo do dashboard */}

      <div className="dashboard-content flex min-h-screen flex-col">
        <DashboardHeader
          title="COCA-COLA · Confiabilidade"
          summary={
            dataset
              ? `${dataset.totalRecordsLabel} · ${dataset.totalUnitsLabel}`
              : ""
          }
        />

        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
          <aside className="w-full shrink-0 lg:w-[280px]">
            <FilterSidebar
              analysisType={analysisType}
              onAnalysisTypeChange={setAnalysisType}
              period={period}
              onPeriodChange={setPeriod}
              periodOptions={
                dataset?.filterOptions.periods ?? []
              }
              customFrom={customFrom}
              onCustomFromChange={setCustomFrom}
              customTo={customTo}
              onCustomToChange={setCustomTo}
              unit={unit}
              onUnitChange={setUnit}
              unitOptions={
                dataset?.filterOptions.units ?? []
              }
              line={line}
              onLineChange={setLine}
              lineOptions={
                dataset?.filterOptions.lines ?? []
              }
              turno={turno}
              onTurnoChange={setTurno}
              turnoOptions={
                dataset?.filterOptions.turnos ?? []
              }
              equipamento={equipamento}
              onEquipamentoChange={setEquipamento}
              equipamentoOptions={
                dataset?.filterOptions.equipamentos ?? []
              }
              sistema={sistema}
              onSistemaChange={setSistema}
              sistemaOptions={
                dataset?.filterOptions.sistemas ?? []
              }
              subsistema={subsistema}
              onSubsistemaChange={setSubsistema}
              subsistemaOptions={
                dataset?.filterOptions.subsistemas ?? []
              }
              topN={topN}
              onTopNChange={setTopN}
            />
          </aside>

          <section className="min-w-0 flex-1 space-y-6">
            {/* Chips de filtros ativos */}

            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label={periodChipLabel}
                onRemove={() => {
                  setPeriod(DEFAULT_PERIOD);
                  setCustomFrom("");
                  setCustomTo("");
                }}
              />

              <FilterChip
                label={unitLabel}
                onRemove={() => setUnit(DEFAULT_UNIT)}
              />

              {line !== DEFAULT_LINE && (
                <FilterChip
                  label={lineLabel}
                  onRemove={() => setLine(DEFAULT_LINE)}
                />
              )}

              {turno !== DEFAULT_TURNO && (
                <FilterChip
                  label={turnoLabel}
                  onRemove={() =>
                    setTurno(DEFAULT_TURNO)
                  }
                />
              )}

              {equipamento !== DEFAULT_EQUIPAMENTO &&
                equipamentoLabel && (
                  <FilterChip
                    label={equipamentoLabel}
                    onRemove={() =>
                      setEquipamento(
                        DEFAULT_EQUIPAMENTO,
                      )
                    }
                  />
                )}

              {sistema !== DEFAULT_SISTEMA &&
                sistemaLabel && (
                  <FilterChip
                    label={sistemaLabel}
                    onRemove={() =>
                      setSistema(DEFAULT_SISTEMA)
                    }
                  />
                )}

              {subsistema !== DEFAULT_SUBSISTEMA &&
                subsistemaLabel && (
                  <FilterChip
                    label={subsistemaLabel}
                    onRemove={() =>
                      setSubsistema(DEFAULT_SUBSISTEMA)
                    }
                  />
                )}

              <FilterChip
                label={`Top ${topN}`}
                onRemove={() =>
                  setTopN(DEFAULT_TOP_N)
                }
              />

              {selectedQuadrant && (
                <FilterChip
                  label={
                    QUADRANT_CHIP_LABELS[
                      selectedQuadrant
                    ]
                  }
                  onRemove={() =>
                    setSelectedQuadrant(null)
                  }
                />
              )}

              <button
                type="button"
                onClick={clearAll}
                className="text-[12px] font-medium text-[#F40009] transition-colors duration-200 hover:text-[#DE0008]"
              >
                limpar tudo
              </button>
            </div>

            {/* KPIs */}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Paradas"
                value={
                  dataset
                    ? formatThousands(
                        dataset.summary.paradas,
                      )
                    : "—"
                }
              />

              <KpiCard
                label="Minutos"
                value={
                  dataset
                    ? formatCompact(
                        dataset.summary.minutos,
                      )
                    : "—"
                }
              />

              <KpiCard
                label="Críticos"
                value={
                  dataset
                    ? formatThousands(
                        dataset.summary.criticos,
                      )
                    : "—"
                }
              />

              <KpiCard
                label="Crit-crôn"
                value={
                  dataset
                    ? formatThousands(
                        dataset.summary.critCronico,
                      )
                    : "—"
                }
                accent
              />
            </div>

            {/* Pareto */}

            <ChartPanel
              title="Pareto - tempo de parada"
              caption={`${visiblePareto.length} equipamentos · min (barras) / % acum (linha)`}
            >
              <ParetoChart data={visiblePareto} />
            </ChartPanel>

            {/* Jack Knife */}

            <ChartPanel
              title="Jack Knife"
              headerRight="clique no quadrante = filtra"
              caption="nº de falhas (log) →"
            >
              <JackKnifeChart
                data={dataset?.jackKnife ?? []}
                selectedQuadrant={selectedQuadrant}
                onSelectQuadrant={toggleQuadrant}
              />
            </ChartPanel>
          </section>
        </div>
      </div>
    </main>
  );
}
