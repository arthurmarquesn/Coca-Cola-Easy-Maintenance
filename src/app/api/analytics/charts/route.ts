import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getSession } from "@/lib/session";

import { getUnitSelection } from "@/lib/unit-selection";

import { loadAnalyticsEvents } from "@/lib/analytics/events";

import { buildKpis } from "@/lib/analytics/aggregations/kpis";

import {
  buildFailurePareto,
  type ParetoSort,
} from "@/lib/analytics/aggregations/failure-pareto";

import { buildCoverage } from "@/lib/analytics/aggregations/coverage";

import { buildByLine } from "@/lib/analytics/aggregations/by-line";

import { isDateValue } from "@/lib/analytics/sql";

import type {
  AnalyticsFilters,
} from "@/lib/analytics/types";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* =========================================================
   GRÁFICOS COMPLEMENTARES

   Fase 1: G11 (KPIs), G1, G2 e G9.

   Usa os mesmos filtros da tela de Confiabilidade
   (período, linha e equipamento) e aplica D = "P.EQ.LINHA",
   isolando as paradas de manutenção.
========================================================= */

/*
  Período anterior de mesmo tamanho, imediatamente antes do
  filtrado. Base da variação % dos cartões de KPI.
*/
function previousPeriod(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const start = new Date(
    `${startDate}T00:00:00Z`,
  );

  const end = new Date(
    `${endDate}T00:00:00Z`,
  );

  const dayMs = 24 * 60 * 60 * 1000;

  /* +1 porque o intervalo inclui as duas pontas. */
  const lengthMs =
    end.getTime() -
    start.getTime() +
    dayMs;

  const previousEnd = new Date(
    start.getTime() - dayMs,
  );

  const previousStart = new Date(
    previousEnd.getTime() -
      lengthMs +
      dayMs,
  );

  return {
    startDate: previousStart
      .toISOString()
      .slice(0, 10),

    endDate: previousEnd
      .toISOString()
      .slice(0, 10),
  };
}

export async function GET(
  request: NextRequest,
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Sessão expirada.",
      },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(
      request.url,
    );

    const startDate =
      searchParams.get("startDate");

    const endDate =
      searchParams.get("endDate");

    if ((startDate && !isDateValue(startDate)) || (endDate && !isDateValue(endDate)) ||
        (startDate && endDate && startDate > endDate)) {
      return NextResponse.json({ success: false, message: "Período inválido." }, { status: 400 });
    }

    const filters: AnalyticsFilters = {
      startDate: isDateValue(startDate)
        ? startDate
        : null,

      endDate: isDateValue(endDate)
        ? endDate
        : null,

      line:
        searchParams
          .get("line")
          ?.trim() || null,

      equipment:
        searchParams
          .get("equipment")
          ?.trim() || null,
    };

    const sort: ParetoSort =
      searchParams.get("paretoSort") ===
      "occurrences"
        ? "occurrences"
        : "downtime";

    const { selectedUnitIds } = await getUnitSelection({ userId: session.userId, defaultUnitId: session.unitId });
    if (!selectedUnitIds.length) return NextResponse.json({ success: false, message: "Nenhuma unidade selecionada." }, { status: 403 });

    const { events, nullDowntimeRows } =
      await loadAnalyticsEvents(
        selectedUnitIds,
        filters,
        {
          onlyMaintenanceStops: true,
        },
      );

    /*
      O período anterior só existe quando as duas datas foram
      informadas. Sem isso não há como definir seu tamanho.
    */
    let previousEvents = {
      events: [],
    } as { events: typeof events };

    if (
      filters.startDate &&
      filters.endDate
    ) {
      const previous = previousPeriod(
        filters.startDate,
        filters.endDate,
      );

      previousEvents =
        await loadAnalyticsEvents(
          selectedUnitIds,
          {
            ...filters,
            startDate:
              previous.startDate,
            endDate: previous.endDate,
          },
          {
            onlyMaintenanceStops: true,
          },
        );
    }

    const payload = {
      success: true,

      filters,

      /*
        Linhas que vieram sem minutos de parada. Contam em Q
        com 0 minuto; a tela avisa para o número não parecer
        errado.
      */
      dataQuality: {
        nullDowntimeRows,
        totalRows: events.length,
      },

      kpis: buildKpis(
        events,
        previousEvents.events,
      ),

      failurePareto: buildFailurePareto(
        events,
        { sort },
      ),

      coverage: buildCoverage(events),

      byLine: buildByLine(events),
    };

    // Fresh reads keep reviewed data consistent across server instances.
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(
      "GET /api/analytics/charts",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Não foi possível carregar os gráficos complementares.",
      },
      { status: 500 },
    );
  }
}
