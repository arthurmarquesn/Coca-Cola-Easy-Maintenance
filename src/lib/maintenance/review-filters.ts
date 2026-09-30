import type {
  ExecuteValues,
} from "mysql2/promise";

/* =========================================================
   EASY MAINTENANCE
   FILTROS COMBINÁVEIS DA VALIDAÇÃO HUMANA

   Monta a cláusula WHERE + valores usados tanto pelo
   endpoint de categorias (resumo) quanto pelo endpoint de
   ocorrências (tabela). Mantendo a lógica em um único
   lugar garante que os números batem entre as duas telas.

   Tabelas/aliases esperados na query que usar este helper:
     cs -> classification_suggestions
     me -> maintenance_events
========================================================= */

export type ReviewStatus =
  | "PENDENTE_REVISAO"
  | "CONFIRMADA"
  | "CORRIGIDA"
  | "DESCARTADA";

const VALID_STATUSES: ReviewStatus[] = [
  "PENDENTE_REVISAO",
  "CONFIRMADA",
  "CORRIGIDA",
  "DESCARTADA",
];

export interface ParsedReviewFilters {
  whereSql: string;
  values: ExecuteValues[];
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseReviewFilters(
  searchParams: URLSearchParams,
  unitId: number,
): ParsedReviewFilters {
  const whereParts: string[] = [
    "me.unit_id = ?",
    "cs.model_type = 'ML'",
  ];

  const values: unknown[] = [unitId];

  const status = (
    searchParams.get("status") ?? ""
  )
    .trim()
    .toUpperCase();

  if (
    status &&
    status !== "ALL" &&
    VALID_STATUSES.includes(status as ReviewStatus)
  ) {
    whereParts.push("cs.status = ?");
    values.push(status);
  }

  const lineId = Number(
    searchParams.get("lineId") ?? "",
  );

  if (Number.isInteger(lineId) && lineId > 0) {
    whereParts.push("me.production_line_id = ?");
    values.push(lineId);
  }

  const equipmentId = Number(
    searchParams.get("equipmentId") ?? "",
  );

  if (
    Number.isInteger(equipmentId) &&
    equipmentId > 0
  ) {
    whereParts.push("me.equipment_id = ?");
    values.push(equipmentId);
  }

  const shift = (
    searchParams.get("shift") ?? ""
  ).trim();

  if (shift) {
    whereParts.push("me.shift = ?");
    values.push(shift);
  }

  const dateFrom = (
    searchParams.get("dateFrom") ?? ""
  ).trim();

  if (isValidDate(dateFrom)) {
    whereParts.push("me.event_date >= ?");
    values.push(dateFrom);
  }

  const dateTo = (
    searchParams.get("dateTo") ?? ""
  ).trim();

  if (isValidDate(dateTo)) {
    whereParts.push("me.event_date <= ?");
    values.push(dateTo);
  }

  const confidenceMinRaw = searchParams.get(
    "confidenceMin",
  );

  if (confidenceMinRaw !== null) {
    const parsed = Number(confidenceMinRaw);

    if (Number.isFinite(parsed) && parsed > 0) {
      whereParts.push("cs.confidence >= ?");
      values.push(
        Math.max(0, Math.min(100, parsed)) / 100,
      );
    }
  }

  const confidenceMaxRaw = searchParams.get(
    "confidenceMax",
  );

  if (confidenceMaxRaw !== null) {
    const parsed = Number(confidenceMaxRaw);

    if (Number.isFinite(parsed) && parsed < 100) {
      whereParts.push("cs.confidence <= ?");
      values.push(
        Math.max(0, Math.min(100, parsed)) / 100,
      );
    }
  }

  const search = (
    searchParams.get("search") ?? ""
  )
    .trim()
    .slice(0, 120);

  if (search) {
    whereParts.push(
      `
        (
          me.observation LIKE ?
          OR me.source_equipment_name LIKE ?
          OR me.source_line_name LIKE ?
          OR cs.failure_mode LIKE ?
        )
      `,
    );

    const like = `%${search}%`;

    values.push(like, like, like, like);
  }

  return {
    whereSql: whereParts.join(" AND "),
    values: values as ExecuteValues[],
  };
}
