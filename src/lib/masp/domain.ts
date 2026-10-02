export const MASP_STATUSES = [
  "DRAFT",
  "ANALYSIS",
  "ROOT_CAUSE",
  "ACTION_PLAN",
  "EXECUTION",
  "VERIFICATION",
  "CLOSED",
  "CANCELLED",
] as const;

export type MaspStatus =
  typeof MASP_STATUSES[number];

export const MASP_CATEGORIES = [
  "MAQUINA",
  "METODO",
  "MAO_DE_OBRA",
  "MATERIAL",
  "MEDICAO",
  "MEIO_AMBIENTE",
] as const;

export type MaspCategory =
  typeof MASP_CATEGORIES[number];

export const HYPOTHESIS_STATUSES = [
  "OPEN",
  "PROBABLE",
  "DISCARDED",
  "CONFIRMED",
] as const;

export const HYPOTHESIS_SOURCES = [
  "ANALYST",
  "HISTORY",
  "RULE",
] as const;

export const ROOT_CAUSE_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "REJECTED",
] as const;

export const ACTION_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
] as const;

export const EVIDENCE_TYPES = [
  "EVENT",
  "TEXT",
  "MEASUREMENT",
  "DOCUMENT",
] as const;

export const EVENT_RELATION_TYPES = [
  "SOURCE",
  "EVIDENCE",
  "RECURRENCE",
] as const;

export const FAILURE_ORIGINS = [
  "MANUTENCAO",
  "OPERACAO",
] as const;

const NORMAL_TRANSITIONS:
Record<MaspStatus, readonly MaspStatus[]> = {
  DRAFT: [
    "ANALYSIS",
    "CANCELLED",
  ],
  ANALYSIS: [
    "ROOT_CAUSE",
    "CANCELLED",
  ],
  ROOT_CAUSE: [
    "ACTION_PLAN",
    "CANCELLED",
  ],
  ACTION_PLAN: [
    "EXECUTION",
    "CANCELLED",
  ],
  EXECUTION: [
    "VERIFICATION",
    "CANCELLED",
  ],
  VERIFICATION: [
    "CLOSED",
    "CANCELLED",
  ],
  CLOSED: [],
  CANCELLED: [],
};

export function isOneOf<
  T extends string,
>(
  value: unknown,
  options: readonly T[],
): value is T {
  return (
    typeof value ===
      "string" &&
    options.includes(
      value as T,
    )
  );
}

export function cleanText(
  value: unknown,
  maxLength: number,
): string {
  return typeof value ===
    "string"
    ? value
        .trim()
        .slice(
          0,
          maxLength,
        )
    : "";
}

export function positiveIntegerOrNull(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return (
    Number.isInteger(
      parsed,
    ) &&
    parsed > 0
  )
    ? parsed
    : null;
}

export function nullableDate(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
      "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return null;
  }

  const date =
    new Date(
      `${value}T00:00:00Z`,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : value;
}

export function canTransitionMaspStatus(
  current: MaspStatus,
  next: MaspStatus,
): boolean {
  return (
    current ===
      next ||
    NORMAL_TRANSITIONS[
      current
    ].includes(
      next,
    )
  );
}

