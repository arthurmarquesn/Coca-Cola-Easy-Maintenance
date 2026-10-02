import {
  describe,
  expect,
  it,
} from "vitest";

import { buildFailurePareto } from "./failure-pareto";

import { UNCLASSIFIED_LABEL } from "../sql";

import type {
  AnalyticsEvent,
} from "../types";

/* =========================================================
   G1 - PARETO DE CLASSES DE FALHA
========================================================= */

let nextId = 1;

function event(
  overrides: Partial<AnalyticsEvent> = {},
): AnalyticsEvent {
  return {
    id: nextId++,
    date: "2026-01-15",
    line: "LINHA001",
    equipment: "ENCHEDORA",
    stopType: "P.EQ.LINHA",
    shift: "1",
    intervalLabel: "08:00-09:00",
    observation: "FALHA NO SENSOR",
    downtimeMinutes: 10,
    failureMode: "Falha de sensor",
    unclassified: false,
    ...overrides,
  };
}

describe("buildFailurePareto", () => {
  it("agrupa por classe de falha e ordena por T(min)", () => {
    const result = buildFailurePareto([
      event({
        failureMode: "Falha de sensor",
        downtimeMinutes: 10,
      }),
      event({
        failureMode: "Falha de bomba",
        downtimeMinutes: 30,
      }),
      event({
        failureMode: "Falha de sensor",
        downtimeMinutes: 20,
      }),
    ]);

    expect(
      result.items.map((i) => i.label),
    ).toEqual([
      "Falha de sensor",
      "Falha de bomba",
    ]);

    expect(
      result.items[0].downtimeMinutes,
    ).toBe(30);

    expect(
      result.items[0].occurrences,
    ).toBe(2);

    expect(result.totalDowntimeMinutes).toBe(
      60,
    );

    expect(result.totalOccurrences).toBe(3);
  });

  it("calcula MTTR como T(min) / Q", () => {
    const result = buildFailurePareto([
      event({ downtimeMinutes: 10 }),
      event({ downtimeMinutes: 20 }),
    ]);

    expect(result.items[0].mttr).toBe(15);
  });

  it("fecha o acumulado em 100%", () => {
    const result = buildFailurePareto([
      event({
        failureMode: "A",
        downtimeMinutes: 75,
      }),
      event({
        failureMode: "B",
        downtimeMinutes: 25,
      }),
    ]);

    expect(result.items[0].percentage).toBe(
      75,
    );

    expect(
      result.items[0].cumulativePercentage,
    ).toBe(75);

    expect(
      result.items[1].cumulativePercentage,
    ).toBe(100);
  });

  it("reordena e reacumula ao ordenar por Q", () => {
    /*
      "Rápida" tem mais ocorrências, mas menos minutos. A
      ordem precisa mudar junto com a curva acumulada.
    */
    const events = [
      event({
        failureMode: "Demorada",
        downtimeMinutes: 100,
      }),
      event({
        failureMode: "Rápida",
        downtimeMinutes: 1,
      }),
      event({
        failureMode: "Rápida",
        downtimeMinutes: 1,
      }),
      event({
        failureMode: "Rápida",
        downtimeMinutes: 1,
      }),
    ];

    const byDowntime =
      buildFailurePareto(events);

    expect(byDowntime.items[0].label).toBe(
      "Demorada",
    );

    const byOccurrences =
      buildFailurePareto(events, {
        sort: "occurrences",
      });

    expect(
      byOccurrences.items[0].label,
    ).toBe("Rápida");

    /* 3 de 4 ocorrências = 75%. */
    expect(
      byOccurrences.items[0].percentage,
    ).toBe(75);

    expect(
      byOccurrences.items[1]
        .cumulativePercentage,
    ).toBe(100);
  });

  it("devolve resultado vazio sem quebrar quando não há dados", () => {
    const result = buildFailurePareto([]);

    expect(result.items).toEqual([]);

    expect(result.totalOccurrences).toBe(0);

    expect(
      result.totalDowntimeMinutes,
    ).toBe(0);
  });

  it("conta ocorrência com minutos zerados em Q", () => {
    /*
      Minutos nulos na planilha viram 0, mas a parada
      aconteceu e precisa aparecer na contagem.
    */
    const result = buildFailurePareto([
      event({ downtimeMinutes: 0 }),
      event({ downtimeMinutes: 0 }),
    ]);

    expect(
      result.items[0].occurrences,
    ).toBe(2);

    expect(
      result.items[0].downtimeMinutes,
    ).toBe(0);

    /* Sem minutos, o MTTR é 0 e não NaN. */
    expect(result.items[0].mttr).toBe(0);

    /* Divisão por total zero não vira NaN. */
    expect(result.items[0].percentage).toBe(
      0,
    );
  });

  it("agrupa as não classificadas sob um rótulo próprio", () => {
    const result = buildFailurePareto([
      event({
        observation: null,
        failureMode: UNCLASSIFIED_LABEL,
        unclassified: true,
        downtimeMinutes: 50,
      }),
      event({
        observation: "TEXTO SEM PADRAO",
        failureMode: UNCLASSIFIED_LABEL,
        unclassified: true,
        downtimeMinutes: 10,
      }),
    ]);

    expect(result.items).toHaveLength(1);

    expect(result.items[0].label).toBe(
      UNCLASSIFIED_LABEL,
    );

    expect(
      result.items[0].occurrences,
    ).toBe(2);
  });

  it("junta o excedente em Outras preservando os totais", () => {
    const events = Array.from(
      { length: 5 },
      (_, index) =>
        event({
          failureMode: `Falha ${index}`,
          downtimeMinutes:
            (5 - index) * 10,
        }),
    );

    const result = buildFailurePareto(
      events,
      { limit: 2 },
    );

    expect(result.items).toHaveLength(3);

    expect(result.items[2].label).toBe(
      "Outras",
    );

    /* 30 + 20 + 10 das três classes agrupadas. */
    expect(
      result.items[2].downtimeMinutes,
    ).toBe(60);

    expect(
      result.items[2].occurrences,
    ).toBe(3);

    expect(
      result.items[2].cumulativePercentage,
    ).toBe(100);
  });
});
