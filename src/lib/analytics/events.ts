import type {
  RowDataPacket,
} from "mysql2/promise";

import { executeRows } from "@/lib/db";
import { buildUnitInClause } from "@/lib/unit-selection";

import {
  buildDateWhere,
  CLASSIFICATION_JOINS,
  FAILURE_MODE_EXPRESSION,
  MAINTENANCE_STOP_TYPE,
  UNCLASSIFIED_LABEL,
} from "./sql";

import type {
  AnalyticsEvent,
  AnalyticsFilters,
} from "./types";

/* =========================================================
   CARGA DAS OCORRÊNCIAS

   Busca as linhas uma única vez por combinação de filtros e
   deixa as agregações para funções puras. Assim os gráficos
   compartilham a mesma consulta em vez de baterem no banco
   um por um.
========================================================= */

interface EventRow extends RowDataPacket {
  id: number;
  event_date: string | Date | null;
  line: string | null;
  equipment: string | null;
  stop_type: string | null;
  shift: string | null;
  interval_label: string | null;
  observation: string | null;
  downtime_minutes: number | string | null;
  failure_mode: string | null;
}

export interface LoadEventsResult {
  events: AnalyticsEvent[];

  /*
    Quantas linhas vieram com minutos de parada nulos. Elas
    contam em Q com 0 minuto, e a tela avisa o usuário.
  */
  nullDowntimeRows: number;
}

/*
  A planilha cola o número da Ordem de Serviço dentro do texto
  livre, em formatos variados: "ORDEM: 30008223804",
  "( 30008224330 )". Qualquer sequência de 8 ou mais dígitos é
  O.S. e atrapalha a análise de texto.
*/
export function stripOrderNumbers(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/\b\d{8,}\b/g, " ")
    .replace(
      /\bORDEM\s*:?\s*/gi,
      " ",
    )
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned === ""
    ? null
    : cleaned;
}

function toNumber(
  value: number | string | null,
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function toDateString(
  value: string | Date | null,
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const year = value.getUTCFullYear();

    const month = String(
      value.getUTCMonth() + 1,
    ).padStart(2, "0");

    const day = String(
      value.getUTCDate(),
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return value.slice(0, 10);
}

export async function loadAnalyticsEvents(
  unitIds: number | number[],
  filters: AnalyticsFilters,
  options: {
    /*
      true aplica D = "P.EQ.LINHA", isolando as paradas que
      geraram chamado de manutenção.
    */
    onlyMaintenanceStops?: boolean;
  } = {},
): Promise<LoadEventsResult> {
  const units = buildUnitInClause(Array.isArray(unitIds) ? unitIds : [unitIds]);
  const params: Array<string | number> = [...units.values];

  const where = [
    `e.unit_id IN (${units.placeholders})`,
    ...buildDateWhere(
      filters.startDate,
      filters.endDate,
      params,
    ),
  ];

  if (filters.line) {
    where.push(
      "TRIM(e.source_line_name) = ?",
    );

    params.push(filters.line);
  }

  if (filters.equipment) {
    where.push(
      "TRIM(e.source_equipment_name) = ?",
    );

    params.push(filters.equipment);
  }

  if (options.onlyMaintenanceStops) {
    where.push(
      "UPPER(TRIM(e.source_stop_type)) = ?",
    );

    params.push(
      MAINTENANCE_STOP_TYPE,
    );
  }

  const rows = await executeRows<
    EventRow[]
  >(
    `
      SELECT
        e.id,
        e.event_date,
        TRIM(e.source_line_name) AS line,
        TRIM(e.source_equipment_name) AS equipment,
        TRIM(e.source_stop_type) AS stop_type,
        TRIM(e.shift) AS shift,
        TRIM(e.interval_label) AS interval_label,
        e.observation,
        e.downtime_minutes,
        ${FAILURE_MODE_EXPRESSION} AS failure_mode

      FROM maintenance_events e

      ${CLASSIFICATION_JOINS}

      WHERE ${where.join("\nAND ")}
    `,
    params,
  );

  let nullDowntimeRows = 0;

  const events = rows.map((row) => {
    if (row.downtime_minutes === null) {
      nullDowntimeRows += 1;
    }

    const rawMode =
      row.failure_mode?.trim() ?? "";

    /*
      O banco grava "Não classificado"; a tela mostra
      "Sem Modo de Falha Identificado".
    */
    const unclassified =
      rawMode === "" ||
      rawMode === "Não classificado";

    return {
      id: row.id,

      date: toDateString(
        row.event_date,
      ),

      line: row.line,

      equipment: row.equipment,

      stopType: row.stop_type,

      shift: row.shift || null,

      intervalLabel:
        row.interval_label || null,

      observation: stripOrderNumbers(
        row.observation,
      ),

      downtimeMinutes: toNumber(
        row.downtime_minutes,
      ),

      failureMode: unclassified
        ? UNCLASSIFIED_LABEL
        : rawMode,

      unclassified,
    } satisfies AnalyticsEvent;
  });

  return {
    events,
    nullDowntimeRows,
  };
}
