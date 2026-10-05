"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  LoaderCircle,
} from "lucide-react";

import { KpiCards } from "./kpi-cards";
import { FailureParetoChart } from "./failure-pareto-chart";
import { CoverageChart } from "./coverage-chart";
import { ByLineChart } from "./by-line-chart";

import { buildChartSubtitle } from "@/lib/analytics/format";

import type {
  KpisResult,
} from "@/lib/analytics/aggregations/kpis";

import type {
  FailureParetoResult,
  ParetoSort,
} from "@/lib/analytics/aggregations/failure-pareto";

import type {
  CoverageResult,
} from "@/lib/analytics/aggregations/coverage";

import type {
  ByLineResult,
} from "@/lib/analytics/aggregations/by-line";

/* =========================================================
   GRÁFICOS COMPLEMENTARES - FASE 1

   G11 (KPIs), G1, G2 e G9.

   Consome os mesmos filtros da tela de Confiabilidade. Só
   considera paradas de manutenção (D = "P.EQ.LINHA").
========================================================= */

interface ChartsPayload {
  success: boolean;
  message?: string;

  dataQuality: {
    nullDowntimeRows: number;
    totalRows: number;
  };

  kpis: KpisResult;
  failurePareto: FailureParetoResult;
  coverage: CoverageResult;
  byLine: ByLineResult;
}

interface ComplementaryChartsProps {
  unitSelectionKey: string;
  city: string | null;
  startDate: string;
  endDate: string;
  line: string;
  equipment: string;
  onLineChange: (line: string) => void;
}

export function ComplementaryCharts({
  unitSelectionKey,
  city,
  startDate,
  endDate,
  line,
  equipment,
  onLineChange,
}: ComplementaryChartsProps) {
  const [sort, setSort] =
    useState<ParetoSort>("downtime");

  /*
    Guardamos o resultado junto da combinação de filtros que o
    gerou. "Carregando" passa a ser uma comparação entre a
    combinação atual e a do resultado em mãos, em vez de um
    estado próprio — assim nenhum setState roda de forma
    síncrona dentro do efeito.
  */
  const requestKey = useMemo(
    () =>
      JSON.stringify([
        unitSelectionKey,
        startDate,
        endDate,
        line,
        equipment,
        sort,
      ]),
    [
      unitSelectionKey,
      startDate,
      endDate,
      line,
      equipment,
      sort,
    ],
  );

  const [result, setResult] = useState<{
    key: string;
    data: ChartsPayload | null;
    error: string;
  }>({
    key: "",
    data: null,
    error: "",
  });

  const loading =
    result.key !== requestKey;

  const data = result.data;

  const error = loading
    ? ""
    : result.error;

  const loadData = useCallback(
    async (signal: AbortSignal) => {
      try {
        const params =
          new URLSearchParams();

        if (startDate) {
          params.set(
            "startDate",
            startDate,
          );
        }

        if (endDate) {
          params.set("endDate", endDate);
        }

        if (line) {
          params.set("line", line);
        }

        if (equipment) {
          params.set(
            "equipment",
            equipment,
          );
        }

        params.set("paretoSort", sort);

        const response = await fetch(
          `/api/analytics/charts?${params.toString()}`,
          { signal },
        );

        /* Erro 500 do servidor pode vir sem JSON; sem este
           cuidado a tela mostrava "SyntaxError". */
        const payload =
          (await response
            .json()
            .catch(() => null)) as ChartsPayload | null;

        if (!response.ok || !payload?.success) {
          throw new Error(
            payload?.message ??
              "Não foi possível carregar os gráficos.",
          );
        }

        setResult({
          key: requestKey,
          data: payload,
          error: "",
        });
      } catch (cause) {
        /*
          O abort acontece quando os filtros mudam no meio da
          busca. Não é erro, e marcar a chave faria a tela
          parar de carregar antes da hora.
        */
        if (
          cause instanceof Error &&
          cause.name === "AbortError"
        ) {
          return;
        }

        setResult({
          key: requestKey,
          data: null,
          error:
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os gráficos.",
        });
      }
    },
    [
      requestKey,
      startDate,
      endDate,
      line,
      equipment,
      sort,
    ],
  );

  useEffect(() => {
    const controller =
      new AbortController();

    /*
      A regra set-state-in-effect não enxerga que todo
      setResult acontece depois do await do fetch, nunca de
      forma síncrona. O estado de carregamento é derivado de
      `requestKey`, então não há cascata de renders aqui.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(controller.signal);

    return () => controller.abort();
  }, [loadData]);

  const subtitle = useMemo(
    () =>
      buildChartSubtitle({
        city,
        line: line || null,
        equipment: equipment || null,
        startDate: startDate || null,
        endDate: endDate || null,
      }),
    [
      city,
      line,
      equipment,
      startDate,
      endDate,
    ],
  );

  if (loading && !data) {
    return (
      <div className="mt-8 flex items-center gap-3 text-[13px] text-text-secondary">
        <LoaderCircle
          size={17}
          className="animate-spin text-accent-primary"
        />
        Carregando gráficos complementares...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 flex items-start gap-3 rounded-[14px] border border-border-theme bg-surface-elevated px-4 py-3">
        <AlertCircle
          size={17}
          className="mt-0.5 shrink-0 text-chart-bad"
        />

        <p className="text-[12px] leading-5 text-text-primary">
          {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { nullDowntimeRows, totalRows } =
    data.dataQuality;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em] text-text-primary">
          Análise complementar

          {/* Recarregando com novos filtros: os gráficos
              abaixo ainda são da consulta anterior. */}
          {loading && (
            <LoaderCircle
              size={15}
              className="animate-spin text-accent-primary"
              aria-label="Atualizando gráficos"
            />
          )}
        </h2>

        <p className="text-[11px] text-text-secondary">
          Apenas paradas de manutenção
          (P.EQ.LINHA)
        </p>
      </div>

      {/*
        Linhas sem minutos de parada contam em Q com 0 minuto.
        Sem este aviso o total pareceria errado.
      */}
      {nullDowntimeRows > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-text-secondary">
          {nullDowntimeRows} de {totalRows}{" "}
          ocorrências vieram sem minutos de
          parada e entram na contagem com 0
          minuto.
        </p>
      )}

      <KpiCards cards={data.kpis.cards} />

      <FailureParetoChart
        data={data.failurePareto}
        subtitle={subtitle}
        sort={sort}
        onSortChange={setSort}
      />

      <CoverageChart
        data={data.coverage}
        subtitle={subtitle}
      />

      <ByLineChart
        data={data.byLine}
        subtitle={subtitle}
        selectedLine={line}
        onSelectLine={onLineChange}
      />
    </div>
  );
}
