/* =========================================================
   EASY MAINTENANCE
   VALIDAÇÃO HUMANA — TIPOS COMPARTILHADOS
========================================================= */

export interface ReviewFiltersState {
  lineId: string;
  equipmentId: string;
  shift: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  confidenceMin: number;
  confidenceMax: number;
  search: string;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFiltersState = {
  lineId: "",
  equipmentId: "",
  shift: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  confidenceMin: 0,
  confidenceMax: 100,
  search: "",
};

export interface FilterOption {
  id: number;
  name: string;
}

export interface ReviewFilterOptions {
  lines: FilterOption[];
  equipments: FilterOption[];
  shifts: string[];
}

export interface CategorySummary {
  slug: string;
  label: string;
  description: string;
  total: number;
  pending: number;
  validated: number;
  confirmed: number;
  corrected: number;
  rejected: number;
  percentValidated: number;
  averageConfidence: number | null;
  lowConfidencePending: number;
}

export interface TopPrediction {
  failedComponentCode: string;
  failureMode: string;
  confidence: number;
}

export interface ReviewItem {
  suggestionId: number;
  eventId: number;
  categorySlug: string;
  categoryLabel: string;
  status: "PENDENTE_REVISAO" | "CONFIRMADA" | "CORRIGIDA" | "DESCARTADA";

  event: {
    date: string | null;
    shift: string | null;
    line: string | null;
    equipment: string | null;
    stopType: string | null;
    stopKey1: string | null;
    stopSubkey: string | null;
    observation: string;
    downtimeMinutes: number | null;
  };

  suggestion: {
    failedComponentCode: string;
    failureMode: string;
    confidence: number;
    modelVersion: string;
    topPredictions: TopPrediction[];
  };

  reviewedAt: string | null;
  reviewedByName: string | null;
  note: string | null;
}

export interface ReviewSummary {
  total: number;
  pending: number;
  confirmed: number;
  corrected: number;
  rejected: number;
  reviewed: number;
}

/* =========================================================
   QUERY STRING
========================================================= */

export function buildFilterSearchParams(
  filters: ReviewFiltersState,
  extra?: Record<string, string | number | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.lineId) params.set("lineId", filters.lineId);
  if (filters.equipmentId) params.set("equipmentId", filters.equipmentId);
  if (filters.shift) params.set("shift", filters.shift);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);

  if (filters.confidenceMin > 0) {
    params.set("confidenceMin", String(filters.confidenceMin));
  }

  if (filters.confidenceMax < 100) {
    params.set("confidenceMax", String(filters.confidenceMax));
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }
  }

  return params;
}

export function countActiveFilters(
  filters: ReviewFiltersState,
): number {
  let count = 0;

  if (filters.lineId) count += 1;
  if (filters.equipmentId) count += 1;
  if (filters.shift) count += 1;
  if (filters.status) count += 1;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.search) count += 1;
  if (filters.confidenceMin > 0) count += 1;
  if (filters.confidenceMax < 100) count += 1;

  return count;
}
