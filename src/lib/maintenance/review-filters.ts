import { containsLikePattern } from "@/lib/analytics/sql";
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseReviewFilters(
  searchParams: URLSearchParams,
  unitIds: number[],
): ParsedReviewFilters {
  /* Mesma normalização de buildUnitInClause (lib/unit-selection),
     repetida aqui para este módulo seguir puro — sem depender de
     next/headers — e continuar testável isoladamente. */
  const validUnitIds = [
    ...new Set(
      unitIds.filter(
        (unitId) =>
          Number.isInteger(unitId) && unitId > 0,
      ),
    ),
  ];

  if (validUnitIds.length === 0) {
    throw new Error(
      "Nenhuma unidade válida foi selecionada.",
    );
  }

  const whereParts: string[] = [
    `me.unit_id IN (${validUnitIds
      .map(() => "?")
      .join(", ")})`,
    "cs.model_type = 'ML'",
    /* Sugestão pendente de evento que já tem classificação
       oficial não pode mais ser revisada (409); fora da fila
       e dos totais. */
    `NOT (
      cs.status = 'PENDENTE_REVISAO'
      AND EXISTS (
        SELECT 1
        FROM event_classifications official
        WHERE official.event_id = me.id
          AND official.status IN ('APROVADA', 'CORRIGIDA')
      )
    )`,
  ];

  const values: unknown[] = [...validUnitIds];

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

  const line = (
    searchParams.get("line") ?? ""
  ).trim();

  if (line) {
    whereParts.push("TRIM(me.source_line_name) = ?");
    values.push(line);
  }

  const equipment = (
    searchParams.get("equipment") ?? ""
  ).trim();

  if (equipment) {
    whereParts.push("TRIM(me.source_equipment_name) = ?");
    values.push(equipment);
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

  if (confidenceMinRaw !== null && confidenceMinRaw.trim() !== "") {
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

  if (confidenceMaxRaw !== null && confidenceMaxRaw.trim() !== "") {
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

    const like = containsLikePattern(search);

    values.push(like, like, like, like);
  }

  return {
    whereSql: whereParts.join(" AND "),
    values: values as ExecuteValues[],
  };
}
