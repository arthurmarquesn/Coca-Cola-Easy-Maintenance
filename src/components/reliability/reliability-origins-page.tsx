"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FailureOriginAnalysis,
  type FailureOriginSummary,
} from "@/components/reliability/failure-origin-analysis";

import {
  ReliabilityToolbar,
} from "@/components/reliability/reliability-toolbar";

import {
  useReliabilityFilters,
} from "@/components/reliability/reiliability-filters-provider";

import {
  UnitFilter,
} from "@/components/units/unit-filter";

/* =========================================================
   TIPOS
========================================================= */

interface ReliabilityOriginsPageProps {
  user: {
    name: string;
  };

  unit: {
    name: string;
  };
}

interface ReliabilityUnit {
  id: number;
  code: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

interface ReliabilityOriginsData {
  success?: boolean;
  message?: string;

  filters: {
    selectedUnitIds: number[];
    selectedUnits: ReliabilityUnit[];

    startDate: string | null;
    endDate: string | null;

    line: string | null;
    equipment: string | null;

    options: {
      lines: string[];
      equipments: string[];
    };
  };

  summary: {
    events: number;
    downtimeMinutes: number;
    groups: number;
  };

  failureOrigin: FailureOriginSummary;
}

interface OriginSummaryMetrics {
  total: number;
  classified: number;

  operation: number;
  maintenance: number;
  unclassified: number;

  reviewed: number;
  modelOnly: number;

  operationPercentage: number;
  maintenancePercentage: number;
  unclassifiedPercentage: number;

  reviewedPercentage: number;
  modelOnlyPercentage: number;

  downtimeMinutes: number;

  operationDowntimeMinutes: number;
  maintenanceDowntimeMinutes: number;
  unclassifiedDowntimeMinutes: number;

  operationDowntimePercentage: number;
  maintenanceDowntimePercentage: number;
  unclassifiedDowntimePercentage: number;
}

interface OriginTimelineItem {
  period: string | null;

  total: number;

  operation: number;
  maintenance: number;
  unclassified: number;
  reviewed: number;

  downtimeMinutes: number;

  operationPercentage: number;
  maintenancePercentage: number;
  unclassifiedPercentage: number;
}

interface OriginLineItem {
  line: string;

  total: number;

  operation: number;
  maintenance: number;
  unclassified: number;
  reviewed: number;

  downtimeMinutes: number;

  operationDowntimeMinutes: number;
  maintenanceDowntimeMinutes: number;
  unclassifiedDowntimeMinutes: number;

  operationPercentage: number;
  maintenancePercentage: number;
  unclassifiedPercentage: number;
}

interface OriginsSummaryData {
  success?: boolean;
  message?: string;

  editable: boolean;

  view: "SUMMARY";

  filter: {
    startDate: string | null;
    endDate: string | null;
    line: string | null;
    equipment: string | null;
    selectedUnitIds: number[];
  };

  summary: OriginSummaryMetrics;

  timeline: OriginTimelineItem[];

  byLine: OriginLineItem[];
}

type TimelineMetric =
  | "COUNT"
  | "PERCENTAGE";

/* =========================================================
   HELPERS
========================================================= */

function parseNumber(
  value: unknown,
): number {
  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : Number.NaN;
  }

  if (
    typeof value !==
    "string"
  ) {
    return Number.NaN;
  }

  let text =
    value
      .trim()
      .replace(
        /\s+/g,
        "",
      );

  if (!text) {
    return Number.NaN;
  }

  if (
    text.includes(",")
  ) {
    if (
      text.includes(".")
    ) {
      text =
        text.replace(
          /\./g,
          "",
        );
    }

    text =
      text.replace(
        ",",
        ".",
      );
  }

  const parsed =
    Number(
      text,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : Number.NaN;
}

function safeNonNegative(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    parseNumber(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed < 0
  ) {
    return fallback;
  }

  return parsed;
}

function clampPercentage(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      value,
    ),
  );
}

function normalizeUnit(
  value: unknown,
): ReliabilityUnit | null {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  const source =
    value as Record<
      string,
      unknown
    >;

  const id =
    Number(
      source.id,
    );

  if (
    !Number.isInteger(
      id,
    ) ||
    id <= 0
  ) {
    return null;
  }

  const name =
    typeof source.name ===
      "string"
      ? source.name.trim()
      : "";

  if (!name) {
    return null;
  }

  return {
    id,

    code:
      typeof source.code ===
        "string"
        ? source.code.trim() ||
          null
        : null,

    name,

    city:
      typeof source.city ===
        "string"
        ? source.city.trim() ||
          null
        : null,

    state:
      typeof source.state ===
        "string"
        ? source.state.trim() ||
          null
        : null,
  };
}

function getUnitLabel(
  unit: ReliabilityUnit,
): string {
  return (
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}

function formatNumber(
  value: number,
  maximumFractionDigits =
    0,
): string {
  const safe =
    Number.isFinite(
      value,
    )
      ? value
      : 0;

  return new Intl
    .NumberFormat(
      "pt-BR",
      {
        maximumFractionDigits,
      },
    )
    .format(
      safe,
    );
}

function formatMinutes(
  value: number,
): string {
  const safe =
    Number.isFinite(
      value,
    )
      ? Math.max(
          0,
          value,
        )
      : 0;

  if (
    safe <
    60
  ) {
    return `${formatNumber(
      safe,
      1,
    )} min`;
  }

  const hours =
    safe /
    60;

  return `${formatNumber(
    hours,
    1,
  )} h`;
}

function formatShortDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const parts =
    value.split(
      "-",
    );

  if (
    parts.length <
    3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}`;
}

/* =========================================================
   NORMALIZAÇÃO DA API PRINCIPAL
========================================================= */

function normalizeData(
  raw: unknown,
): ReliabilityOriginsData {
  const source =
    raw &&
    typeof raw ===
      "object"
      ? raw as Record<
          string,
          unknown
        >
      : {};

  const filtersRaw =
    source.filters &&
    typeof source.filters ===
      "object"
      ? source.filters as Record<
          string,
          unknown
        >
      : {};

  const optionsRaw =
    filtersRaw.options &&
    typeof filtersRaw.options ===
      "object"
      ? filtersRaw.options as Record<
          string,
          unknown
        >
      : {};

  const summaryRaw =
    source.summary &&
    typeof source.summary ===
      "object"
      ? source.summary as Record<
          string,
          unknown
        >
      : {};

  const failureOriginRaw =
    source.failureOrigin &&
    typeof source.failureOrigin ===
      "object"
      ? source.failureOrigin as Record<
          string,
          unknown
        >
      : {};

  const selectedUnitIds =
    Array.isArray(
      filtersRaw.selectedUnitIds,
    )
      ? [
          ...new Set(
            filtersRaw.selectedUnitIds
              .map(
                (
                  value,
                ) =>
                  Number(
                    value,
                  ),
              )
              .filter(
                (
                  value,
                ) =>
                  Number.isInteger(
                    value,
                  ) &&
                  value >
                    0,
              ),
          ),
        ]
      : [];

  const selectedUnits =
    Array.isArray(
      filtersRaw.selectedUnits,
    )
      ? filtersRaw.selectedUnits
          .map(
            normalizeUnit,
          )
          .filter(
            (
              value,
            ): value is ReliabilityUnit =>
              value !==
              null,
          )
      : [];

  const lines =
    Array.isArray(
      optionsRaw.lines,
    )
      ? optionsRaw.lines.filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
      : [];

  const equipments =
    Array.isArray(
      optionsRaw.equipments,
    )
      ? optionsRaw.equipments.filter(
          (
            value,
          ): value is string =>
            typeof value ===
            "string",
        )
      : [];

  const operation =
    safeNonNegative(
      failureOriginRaw.operation,
    );

  const maintenance =
    safeNonNegative(
      failureOriginRaw.maintenance,
    );

  const unclassified =
    safeNonNegative(
      failureOriginRaw.unclassified,
    );

  const classified =
    safeNonNegative(
      failureOriginRaw.classified,
      operation +
        maintenance,
    );

  const total =
    safeNonNegative(
      failureOriginRaw.total,
      classified +
        unclassified,
    );

  const operationPercentage =
    safeNonNegative(
      failureOriginRaw
        .operationPercentage,
      classified > 0
        ? (
            operation /
            classified
          ) *
          100
        : 0,
    );

  const maintenancePercentage =
    safeNonNegative(
      failureOriginRaw
        .maintenancePercentage,
      classified > 0
        ? (
            maintenance /
            classified
          ) *
          100
        : 0,
    );

  const unclassifiedPercentage =
    safeNonNegative(
      failureOriginRaw
        .unclassifiedPercentage,
      total > 0
        ? (
            unclassified /
            total
          ) *
          100
        : 0,
    );

  return {
    success:
      source.success ===
      true,

    message:
      typeof source.message ===
        "string"
        ? source.message
        : undefined,

    filters: {
      selectedUnitIds,
      selectedUnits,

      startDate:
        typeof filtersRaw.startDate ===
          "string"
          ? filtersRaw.startDate
          : null,

      endDate:
        typeof filtersRaw.endDate ===
          "string"
          ? filtersRaw.endDate
          : null,

      line:
        typeof filtersRaw.line ===
          "string"
          ? filtersRaw.line
          : null,

      equipment:
        typeof filtersRaw.equipment ===
          "string"
          ? filtersRaw.equipment
          : null,

      options: {
        lines,
        equipments,
      },
    },

    summary: {
      events:
        safeNonNegative(
          summaryRaw.events,
        ),

      downtimeMinutes:
        safeNonNegative(
          summaryRaw
            .downtimeMinutes,
        ),

      groups:
        safeNonNegative(
          summaryRaw.groups,
        ),
    },

    failureOrigin: {
      operation,
      maintenance,
      unclassified,
      classified,
      total,
      operationPercentage,
      maintenancePercentage,
      unclassifiedPercentage,
    },
  };
}

/* =========================================================
   NORMALIZAÇÃO DO NOVO VIEW SUMMARY
========================================================= */

function normalizeSummaryData(
  raw: unknown,
): OriginsSummaryData {
  const source =
    raw &&
    typeof raw ===
      "object"
      ? raw as Record<
          string,
          unknown
        >
      : {};

  const summaryRaw =
    source.summary &&
    typeof source.summary ===
      "object"
      ? source.summary as Record<
          string,
          unknown
        >
      : {};

  const filterRaw =
    source.filter &&
    typeof source.filter ===
      "object"
      ? source.filter as Record<
          string,
          unknown
        >
      : {};

  const timelineRaw =
    Array.isArray(
      source.timeline,
    )
      ? source.timeline
      : [];

  const byLineRaw =
    Array.isArray(
      source.byLine,
    )
      ? source.byLine
      : [];

  const summary:
    OriginSummaryMetrics = {
    total:
      safeNonNegative(
        summaryRaw.total,
      ),

    classified:
      safeNonNegative(
        summaryRaw.classified,
      ),

    operation:
      safeNonNegative(
        summaryRaw.operation,
      ),

    maintenance:
      safeNonNegative(
        summaryRaw.maintenance,
      ),

    unclassified:
      safeNonNegative(
        summaryRaw.unclassified,
      ),

    reviewed:
      safeNonNegative(
        summaryRaw.reviewed,
      ),

    modelOnly:
      safeNonNegative(
        summaryRaw.modelOnly,
      ),

    operationPercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.operationPercentage,
        ),
      ),

    maintenancePercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.maintenancePercentage,
        ),
      ),

    unclassifiedPercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.unclassifiedPercentage,
        ),
      ),

    reviewedPercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.reviewedPercentage,
        ),
      ),

    modelOnlyPercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.modelOnlyPercentage,
        ),
      ),

    downtimeMinutes:
      safeNonNegative(
        summaryRaw.downtimeMinutes,
      ),

    operationDowntimeMinutes:
      safeNonNegative(
        summaryRaw.operationDowntimeMinutes,
      ),

    maintenanceDowntimeMinutes:
      safeNonNegative(
        summaryRaw.maintenanceDowntimeMinutes,
      ),

    unclassifiedDowntimeMinutes:
      safeNonNegative(
        summaryRaw.unclassifiedDowntimeMinutes,
      ),

    operationDowntimePercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.operationDowntimePercentage,
        ),
      ),

    maintenanceDowntimePercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.maintenanceDowntimePercentage,
        ),
      ),

    unclassifiedDowntimePercentage:
      clampPercentage(
        safeNonNegative(
          summaryRaw.unclassifiedDowntimePercentage,
        ),
      ),
  };

  const timeline:
    OriginTimelineItem[] =
    timelineRaw
      .map(
        (
          value,
        ) => {
          if (
            !value ||
            typeof value !==
              "object"
          ) {
            return null;
          }

          const item =
            value as Record<
              string,
              unknown
            >;

          return {
            period:
              typeof item.period ===
                "string"
                ? item.period
                : null,

            total:
              safeNonNegative(
                item.total,
              ),

            operation:
              safeNonNegative(
                item.operation,
              ),

            maintenance:
              safeNonNegative(
                item.maintenance,
              ),

            unclassified:
              safeNonNegative(
                item.unclassified,
              ),

            reviewed:
              safeNonNegative(
                item.reviewed,
              ),

            downtimeMinutes:
              safeNonNegative(
                item.downtimeMinutes,
              ),

            operationPercentage:
              clampPercentage(
                safeNonNegative(
                  item.operationPercentage,
                ),
              ),

            maintenancePercentage:
              clampPercentage(
                safeNonNegative(
                  item.maintenancePercentage,
                ),
              ),

            unclassifiedPercentage:
              clampPercentage(
                safeNonNegative(
                  item.unclassifiedPercentage,
                ),
              ),
          };
        },
      )
      .filter(
        (
          item,
        ): item is OriginTimelineItem =>
          item !==
          null,
      );

  const byLine:
    OriginLineItem[] =
    byLineRaw
      .map(
        (
          value,
        ) => {
          if (
            !value ||
            typeof value !==
              "object"
          ) {
            return null;
          }

          const item =
            value as Record<
              string,
              unknown
            >;

          return {
            line:
              typeof item.line ===
                "string" &&
              item.line.trim()
                ? item.line.trim()
                : "Linha não informada",

            total:
              safeNonNegative(
                item.total,
              ),

            operation:
              safeNonNegative(
                item.operation,
              ),

            maintenance:
              safeNonNegative(
                item.maintenance,
              ),

            unclassified:
              safeNonNegative(
                item.unclassified,
              ),

            reviewed:
              safeNonNegative(
                item.reviewed,
              ),

            downtimeMinutes:
              safeNonNegative(
                item.downtimeMinutes,
              ),

            operationDowntimeMinutes:
              safeNonNegative(
                item.operationDowntimeMinutes,
              ),

            maintenanceDowntimeMinutes:
              safeNonNegative(
                item.maintenanceDowntimeMinutes,
              ),

            unclassifiedDowntimeMinutes:
              safeNonNegative(
                item.unclassifiedDowntimeMinutes,
              ),

            operationPercentage:
              clampPercentage(
                safeNonNegative(
                  item.operationPercentage,
                ),
              ),

            maintenancePercentage:
              clampPercentage(
                safeNonNegative(
                  item.maintenancePercentage,
                ),
              ),

            unclassifiedPercentage:
              clampPercentage(
                safeNonNegative(
                  item.unclassifiedPercentage,
                ),
              ),
          };
        },
      )
      .filter(
        (
          item,
        ): item is OriginLineItem =>
          item !==
          null,
      );

  const selectedUnitIds =
    Array.isArray(
      filterRaw.selectedUnitIds,
    )
      ? filterRaw.selectedUnitIds
          .map(
            (
              value,
            ) =>
              Number(
                value,
              ),
          )
          .filter(
            (
              value,
            ) =>
              Number.isInteger(
                value,
              ) &&
              value >
                0,
          )
      : [];

  return {
    success:
      source.success ===
      true,

    message:
      typeof source.message ===
        "string"
        ? source.message
        : undefined,

    editable:
      source.editable ===
      true,

    view:
      "SUMMARY",

    filter: {
      startDate:
        typeof filterRaw.startDate ===
          "string"
          ? filterRaw.startDate
          : null,

      endDate:
        typeof filterRaw.endDate ===
          "string"
          ? filterRaw.endDate
          : null,

      line:
        typeof filterRaw.line ===
          "string"
          ? filterRaw.line
          : null,

      equipment:
        typeof filterRaw.equipment ===
          "string"
          ? filterRaw.equipment
          : null,

      selectedUnitIds,
    },

    summary,

    timeline,

    byLine,
  };
}

/* =========================================================
   COMPONENTE: INDICADOR
========================================================= */

function OriginMetric({
  label,
  value,
  detail,
  emphasis = false,
  warning = false,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-baseline gap-2">
        <p
          className={[
            "text-[24px] font-semibold tracking-[-0.045em]",
            emphasis
              ? "text-accent-primary"
              : warning
                ? "text-accent-primary"
                : "text-text-primary",
          ].join(
            " ",
          )}
        >
          {value}
        </p>

        {detail && (
          <span className="truncate text-[9px] font-medium text-text-muted">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   COMPONENTE: DISTRIBUIÇÃO PRINCIPAL
========================================================= */

function OriginDistribution({
  summary,
}: {
  summary: OriginSummaryMetrics;
}) {
  const classified =
    summary.classified;

  const operationShare =
    classified > 0
      ? clampPercentage(
          summary.operationPercentage,
        )
      : 0;

  const maintenanceShare =
    classified > 0
      ? clampPercentage(
          summary.maintenancePercentage,
        )
      : 0;

  return (
    <section className="overflow-hidden rounded-[26px] border border-border-theme bg-surface shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      <div className="flex items-center justify-between gap-4 border-b border-border-theme px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
          Distribuição
        </h2>

        <p className="text-[9px] font-medium text-text-muted">
          {formatNumber(
            classified,
          )}{" "}
          classificadas
        </p>
      </div>

      <div className="px-5 py-6 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_220px] lg:items-center">
          <div>
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[10px] font-medium text-text-secondary">
                  Operação
                </p>

                <p className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.055em] text-accent-primary">
                  {formatNumber(
                    operationShare,
                    1,
                  )}
                  %
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-medium text-text-secondary">
                  Manutenção
                </p>

                <p className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.055em] text-text-primary">
                  {formatNumber(
                    maintenanceShare,
                    1,
                  )}
                  %
                </p>
              </div>
            </div>

            <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-surface-hover">
              {operationShare >
                0 && (
                <div
                  className="h-full bg-accent-primary transition-[width] duration-500"
                  style={{
                    width:
                      `${operationShare}%`,
                  }}
                />
              )}

              {maintenanceShare >
                0 && (
                <div
                  className="h-full bg-surface-inverse transition-[width] duration-500"
                  style={{
                    width:
                      `${maintenanceShare}%`,
                  }}
                />
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[9px] text-text-secondary">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent-primary" />

                {formatNumber(
                  summary.operation,
                )}{" "}
                ocorrências de operação
              </span>

              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-surface-inverse" />

                {formatNumber(
                  summary.maintenance,
                )}{" "}
                ocorrências de manutenção
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-border-theme bg-surface-hover lg:grid-cols-1">
            <div className="bg-background-primary px-4 py-4">
              <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                Parada · operação
              </p>

              <p className="mt-2 text-[17px] font-semibold tracking-[-0.035em] text-text-primary">
                {formatMinutes(
                  summary.operationDowntimeMinutes,
                )}
              </p>
            </div>

            <div className="bg-background-primary px-4 py-4">
              <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                Parada · manutenção
              </p>

              <p className="mt-2 text-[17px] font-semibold tracking-[-0.035em] text-text-primary">
                {formatMinutes(
                  summary.maintenanceDowntimeMinutes,
                )}
              </p>
            </div>
          </div>
        </div>

        {summary.unclassified >
          0 && (
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-border-theme pt-4">
            <p className="text-[10px] text-text-secondary">
              Não classificados
            </p>

            <div className="text-right">
              <span className="text-[11px] font-semibold text-accent-primary">
                {formatNumber(
                  summary.unclassified,
                )}
              </span>

              <span className="ml-2 text-[9px] text-text-muted">
                {formatNumber(
                  summary.unclassifiedPercentage,
                  1,
                )}
                %
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   COMPONENTE: EVOLUÇÃO TEMPORAL
========================================================= */

function OriginTimeline({
  items,
}: {
  items: OriginTimelineItem[];
}) {
  const [
    metric,
    setMetric,
  ] =
    useState<TimelineMetric>(
      "PERCENTAGE",
    );

  if (
    items.length ===
    0
  ) {
    return (
      <section className="overflow-hidden rounded-[26px] border border-border-theme bg-surface shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
        <div className="border-b border-border-theme px-5 py-4 sm:px-6">
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
            Evolução
          </h2>
        </div>

        <div className="flex min-h-[280px] items-center justify-center text-[11px] text-text-muted">
          Sem dados para o período selecionado.
        </div>
      </section>
    );
  }

  const width =
    900;

  const height =
    320;

  const left =
    44;

  const right =
    22;

  const top =
    24;

  const bottom =
    44;

  const plotWidth =
    width -
    left -
    right;

  const plotHeight =
    height -
    top -
    bottom;

  const operationValues =
    items.map(
      (
        item,
      ) =>
        metric ===
        "PERCENTAGE"
          ? item.operationPercentage
          : item.operation,
    );

  const maintenanceValues =
    items.map(
      (
        item,
      ) =>
        metric ===
        "PERCENTAGE"
          ? item.maintenancePercentage
          : item.maintenance,
    );

  const maximum =
    metric ===
    "PERCENTAGE"
      ? 100
      : Math.max(
          1,
          ...operationValues,
          ...maintenanceValues,
        );

  function xFor(
    index: number,
  ) {
    if (
      items.length <=
      1
    ) {
      return (
        left +
        plotWidth /
          2
      );
    }

    return (
      left +
      (
        index /
        (
          items.length -
          1
        )
      ) *
        plotWidth
    );
  }

  function yFor(
    value: number,
  ) {
    const safe =
      Math.min(
        maximum,
        Math.max(
          0,
          value,
        ),
      );

    return (
      top +
      plotHeight -
      (
        safe /
        maximum
      ) *
        plotHeight
    );
  }

  const operationPath =
    items
      .map(
        (
          item,
          index,
        ) => {
          const value =
            metric ===
            "PERCENTAGE"
              ? item.operationPercentage
              : item.operation;

          const x =
            xFor(
              index,
            );

          const y =
            yFor(
              value,
            );

          return `${index === 0
            ? "M"
            : "L"} ${x} ${y}`;
        },
      )
      .join(
        " ",
      );

  const maintenancePath =
    items
      .map(
        (
          item,
          index,
        ) => {
          const value =
            metric ===
            "PERCENTAGE"
              ? item.maintenancePercentage
              : item.maintenance;

          const x =
            xFor(
              index,
            );

          const y =
            yFor(
              value,
            );

          return `${index === 0
            ? "M"
            : "L"} ${x} ${y}`;
        },
      )
      .join(
        " ",
      );

  const horizontalTicks =
    metric ===
    "PERCENTAGE"
      ? [
          0,
          25,
          50,
          75,
          100,
        ]
      : [
          0,
          0.25,
          0.5,
          0.75,
          1,
        ].map(
          (
            fraction,
          ) =>
            maximum *
            fraction,
        );

  const labelStep =
    Math.max(
      1,
      Math.ceil(
        items.length /
          6,
      ),
    );

  return (
    <section className="overflow-hidden rounded-[26px] border border-border-theme bg-surface shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      <div className="flex flex-col gap-3 border-b border-border-theme px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
            Evolução
          </h2>

          <div className="mt-2 flex items-center gap-5 text-[8px] font-medium text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent-primary" />

              Operação
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface-inverse" />

              Manutenção
            </span>
          </div>
        </div>

        <div className="inline-flex self-start rounded-[11px] bg-surface-elevated p-1 sm:self-auto">
          <button
            type="button"
            onClick={() =>
              setMetric(
                "PERCENTAGE",
              )
            }
            className={[
              "h-8 rounded-[8px] px-3 text-[9px] font-semibold transition",
              metric ===
              "PERCENTAGE"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(
              " ",
            )}
          >
            %
          </button>

          <button
            type="button"
            onClick={() =>
              setMetric(
                "COUNT",
              )
            }
            className={[
              "h-8 rounded-[8px] px-3 text-[9px] font-semibold transition",
              metric ===
              "COUNT"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(
              " ",
            )}
          >
            Ocorrências
          </button>
        </div>
      </div>

      <div className="px-3 pb-3 pt-4 sm:px-5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Evolução temporal da origem das falhas"
        >
          {horizontalTicks.map(
            (
              value,
              index,
            ) => {
              const y =
                yFor(
                  value,
                );

              return (
                <g
                  key={`grid-${index}`}
                >
                  <line
                    x1={
                      left
                    }
                    x2={
                      width -
                      right
                    }
                    y1={
                      y
                    }
                    y2={
                      y
                    }
                    stroke="var(--chart-grid)"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      left -
                      10
                    }
                    y={
                      y +
                      3
                    }
                    textAnchor="end"
                    fontSize="8"
                    fill="var(--text-secondary)"
                  >
                    {metric ===
                    "PERCENTAGE"
                      ? `${formatNumber(
                          value,
                        )}%`
                      : formatNumber(
                          value,
                        )}
                  </text>
                </g>
              );
            },
          )}

          <path
            d={
              operationPath
            }
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={
              maintenancePath
            }
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {items.map(
            (
              item,
              index,
            ) => {
              const x =
                xFor(
                  index,
                );

              const operationValue =
                metric ===
                "PERCENTAGE"
                  ? item.operationPercentage
                  : item.operation;

              const maintenanceValue =
                metric ===
                "PERCENTAGE"
                  ? item.maintenancePercentage
                  : item.maintenance;

              return (
                <g
                  key={`${item.period}-${index}`}
                >
                  <circle
                    cx={
                      x
                    }
                    cy={
                      yFor(
                        operationValue,
                      )
                    }
                    r="3.2"
                    fill="var(--accent-primary)"
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                  />

                  <circle
                    cx={
                      x
                    }
                    cy={
                      yFor(
                        maintenanceValue,
                      )
                    }
                    r="3"
                    fill="var(--text-primary)"
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                  />

                  {(
                    index %
                      labelStep ===
                      0 ||
                    index ===
                      items.length -
                        1
                  ) && (
                    <text
                      x={
                        x
                      }
                      y={
                        height -
                        15
                      }
                      textAnchor="middle"
                      fontSize="8"
                      fill="var(--text-secondary)"
                    >
                      {formatShortDate(
                        item.period,
                      )}
                    </text>
                  )}
                </g>
              );
            },
          )}

          <line
            x1={
              left
            }
            x2={
              width -
              right
            }
            y1={
              top +
              plotHeight
            }
            y2={
              top +
              plotHeight
            }
            stroke="var(--text-muted)"
          />
        </svg>
      </div>
    </section>
  );
}

/* =========================================================
   COMPONENTE: LINHAS
========================================================= */

function OriginByLine({
  items,
}: {
  items: OriginLineItem[];
}) {
  const [
    expanded,
    setExpanded,
  ] =
    useState(false);

  const visibleItems =
    expanded
      ? items
      : items.slice(
          0,
          8,
        );

  return (
    <section className="overflow-hidden rounded-[26px] border border-border-theme bg-surface shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      <div className="flex items-center justify-between gap-4 border-b border-border-theme px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-text-primary">
          Distribuição por linha
        </h2>

        <span className="text-[9px] text-text-muted">
          {formatNumber(
            items.length,
          )}{" "}
          linhas
        </span>
      </div>

      {items.length ===
      0 ? (
        <div className="flex min-h-[220px] items-center justify-center text-[11px] text-text-muted">
          Sem linhas para o recorte atual.
        </div>
      ) : (
        <>
          <div>
            {visibleItems.map(
              (
                item,
                index,
              ) => {
                const operation =
                  clampPercentage(
                    item.operationPercentage,
                  );

                const maintenance =
                  clampPercentage(
                    item.maintenancePercentage,
                  );

                const unclassified =
                  clampPercentage(
                    item.unclassifiedPercentage,
                  );

                return (
                  <div
                    key={`${item.line}-${index}`}
                    className="border-b border-border-theme px-5 py-4 last:border-b-0 sm:px-6"
                  >
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[220px_1fr_90px] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-text-primary">
                          {item.line}
                        </p>

                        <p className="mt-1 text-[8px] text-text-muted">
                          {formatNumber(
                            item.total,
                          )}{" "}
                          ocorrências ·{" "}
                          {formatMinutes(
                            item.downtimeMinutes,
                          )}
                        </p>
                      </div>

                      <div>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-hover">
                          {operation >
                            0 && (
                            <div
                              className="h-full bg-accent-primary"
                              style={{
                                width:
                                  `${operation}%`,
                              }}
                            />
                          )}

                          {maintenance >
                            0 && (
                            <div
                              className="h-full bg-surface-inverse"
                              style={{
                                width:
                                  `${maintenance}%`,
                              }}
                            />
                          )}

                          {unclassified >
                            0 && (
                            <div
                              className="h-full bg-border-theme"
                              style={{
                                width:
                                  `${unclassified}%`,
                              }}
                            />
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] text-text-secondary">
                          <span>
                            Operação{" "}
                            <strong className="font-semibold text-accent-primary">
                              {formatNumber(
                                operation,
                                1,
                              )}
                              %
                            </strong>
                          </span>

                          <span>
                            Manutenção{" "}
                            <strong className="font-semibold text-text-primary">
                              {formatNumber(
                                maintenance,
                                1,
                              )}
                              %
                            </strong>
                          </span>

                          {item.unclassified >
                            0 && (
                            <span>
                              Sem classificação{" "}
                              {formatNumber(
                                unclassified,
                                1,
                              )}
                              %
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left lg:text-right">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Revisadas
                        </p>

                        <p className="mt-1 text-[13px] font-semibold text-text-primary">
                          {formatNumber(
                            item.reviewed,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>

          {items.length >
            8 && (
            <div className="flex justify-center border-t border-border-theme px-5 py-3">
              <button
                type="button"
                onClick={() =>
                  setExpanded(
                    (
                      current,
                    ) =>
                      !current,
                  )
                }
                className="inline-flex h-8 items-center gap-2 rounded-[10px] px-3 text-[9px] font-semibold text-text-body transition hover:bg-surface-elevated hover:text-text-primary"
              >
                {expanded
                  ? "Mostrar menos"
                  : "Mostrar todas"}

                <ChevronDown
                  size={12}
                  className={
                    expanded
                      ? "rotate-180 transition-transform"
                      : "transition-transform"
                  }
                />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* =========================================================
   PÁGINA
========================================================= */

export function ReliabilityOriginsPage({
  user,
  unit,
}: ReliabilityOriginsPageProps) {
  const {
    startDate,
    endDate,
    line,
    equipment,
    setStartDate,
    setEndDate,
    setLine,
    setEquipment,
    resetFilters,
    clearAssetFilters,
  } =
    useReliabilityFilters();

  const [
    data,
    setData,
  ] =
    useState<
      ReliabilityOriginsData | null
    >(null);

  const [
    analytics,
    setAnalytics,
  ] =
    useState<
      OriginsSummaryData | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  /* =======================================================
     QUERY PARAMS
  ======================================================= */

  const buildParams =
    useCallback(
      () => {
        const params =
          new URLSearchParams();

        if (
          startDate
        ) {
          params.set(
            "startDate",
            startDate,
          );
        }

        if (
          endDate
        ) {
          params.set(
            "endDate",
            endDate,
          );
        }

        if (
          line
        ) {
          params.set(
            "line",
            line,
          );
        }

        if (
          equipment
        ) {
          params.set(
            "equipment",
            equipment,
          );
        }

        return params;
      },
      [
        startDate,
        endDate,
        line,
        equipment,
      ],
    );

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  const loadData =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        setLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const baseParams =
            buildParams();

          const summaryParams =
            new URLSearchParams(
              baseParams,
            );

          summaryParams.set(
            "view",
            "summary",
          );

          const [
            reliabilityResponse,
            summaryResponse,
          ] =
            await Promise.all([
              fetch(
                `/api/analytics/reliability?${baseParams.toString()}`,
                {
                  cache:
                    "no-store",

                  signal,
                },
              ),

              fetch(
                `/api/analytics/reliability/origins?${summaryParams.toString()}`,
                {
                  cache:
                    "no-store",

                  signal,
                },
              ),
            ]);

          const [
            reliabilityRaw,
            summaryRaw,
          ] =
            await Promise.all([
              reliabilityResponse.json(),
              summaryResponse.json(),
            ]);

          if (
            !reliabilityResponse.ok ||
            !reliabilityRaw?.success
          ) {
            throw new Error(
              reliabilityRaw?.message ??
                "Não foi possível carregar os dados de confiabilidade.",
            );
          }

          if (
            !summaryResponse.ok ||
            !summaryRaw?.success
          ) {
            throw new Error(
              summaryRaw?.message ??
                "Não foi possível carregar a análise de origem.",
            );
          }

          setData(
            normalizeData(
              reliabilityRaw,
            ),
          );

          setAnalytics(
            normalizeSummaryData(
              summaryRaw,
            ),
          );
        } catch (
          requestError
        ) {
          if (
            requestError instanceof
              DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "Não foi possível carregar os dados de origem.",
          );
        } finally {
          if (
            !signal
              ?.aborted
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        buildParams,
      ],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(
        () => {
          void loadData(
            controller.signal,
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );

      controller.abort();
    };
  }, [
    loadData,
  ]);

  /* =======================================================
     TROCA DE UNIDADE
  ======================================================= */

  const handleUnitSelectionApplied =
    useCallback(
      async () => {
        if (
          line ||
          equipment
        ) {
          clearAssetFilters();
          return;
        }

        await loadData();
      },
      [
        loadData,
        line,
        equipment,
        clearAssetFilters,
      ],
    );

  /* =======================================================
     LABEL DA UNIDADE
  ======================================================= */

  const selectedUnitsLabel =
    useMemo(
      () => {
        const selectedUnits =
          data
            ?.filters
            .selectedUnits ??
          [];

        if (
          selectedUnits.length ===
            0
        ) {
          return (
            unit.name ??
            "Unidade atual"
          );
        }

        if (
          selectedUnits.length ===
            1
        ) {
          return getUnitLabel(
            selectedUnits[
              0
            ],
          );
        }

        return `${selectedUnits.length} unidades selecionadas`;
      },
      [
        data,
        unit.name,
      ],
    );

  /* =======================================================
     FILTROS
  ======================================================= */

  const lines =
    data
      ?.filters
      .options
      .lines ??
    [];

  const equipments =
    data
      ?.filters
      .options
      .equipments ??
    [];

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-background-primary">
      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-border-theme bg-surface">
        <div className="mx-auto flex h-[76px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link
            href="/dashboard"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={64}
              priority
              className="h-auto max-h-[42px] w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-3 sm:gap-5">
            <UnitFilter
              fallbackLabel={
                unit.name
              }
              onSelectionApplied={
                handleUnitSelectionApplied
              }
            />

            <div className="hidden h-8 w-px bg-black/[0.07] sm:block" />

            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium text-text-primary">
                {user.name}
              </p>

              <p className="mt-0.5 text-[10px] text-text-secondary">
                Análise de confiabilidade
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <div className="mx-auto w-full max-w-[1380px] px-6 pb-16 pt-7 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

        {/* =================================================
            TÍTULO
        ================================================== */}

        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Engenharia de confiabilidade
          </p>

          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
            Confiabilidade
          </h1>
        </div>

        {/* =================================================
            NAVEGAÇÃO
        ================================================== */}

        <nav
          aria-label="Navegação da confiabilidade"
          className="mt-6 overflow-x-auto border-b border-border-theme"
        >
          <div className="flex min-w-max items-center gap-7">
            <Link
              href="/dashboard/confiabilidade"
              className="pb-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Visão geral
            </Link>

            <Link
              href="/dashboard/confiabilidade/origens"
              aria-current="page"
              className="relative pb-3 text-[11px] font-semibold text-text-primary"
            >
              Origens

              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent-primary" />
            </Link>

            <Link
              href="/dashboard/confiabilidade/evolucao"
              className="pb-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Evolução
            </Link>

            <Link
              href="/dashboard/confiabilidade/falhas"
              className="pb-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Falhas recorrentes
            </Link>

            <Link
              href="/dashboard/confiabilidade/linhas"
              className="pb-3 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Linhas
            </Link>
          </div>
        </nav>

        {/* =================================================
            TOOLBAR
        ================================================== */}

        {data && (
          <ReliabilityToolbar
            selectedUnitsLabel={
              selectedUnitsLabel
            }
            startDate={
              startDate
            }
            endDate={
              endDate
            }
            line={
              line
            }
            equipment={
              equipment
            }
            lines={
              lines
            }
            equipments={
              equipments
            }
            events={
              data.summary.events
            }
            downtimeMinutes={
              data.summary.downtimeMinutes
            }
            loading={
              loading
            }
            onStartDateChange={
              setStartDate
            }
            onEndDateChange={
              setEndDate
            }
            onLineChange={
              setLine
            }
            onEquipmentChange={
              setEquipment
            }
            onResetFilters={
              resetFilters
            }
          />
        )}

        {/* =================================================
            ERRO
        ================================================== */}

        {error && (
          <div className="mt-8 rounded-[14px] border border-accent-primary/30 bg-accent-soft px-4 py-3 text-[12px] text-accent-primary">
            {error}
          </div>
        )}

        {/* =================================================
            LOADING INICIAL
        ================================================== */}

        {loading &&
          (!data ||
            !analytics) && (
            <div className="flex min-h-[420px] items-center justify-center">
              <LoaderCircle
                size={22}
                className="animate-spin text-accent-primary"
              />
            </div>
          )}

        {/* =================================================
            ANALYTICS
        ================================================== */}

        {data &&
          analytics && (
            <>
              {/* =============================================
                  INDICADORES
              ============================================== */}

              <section className="mt-5 grid overflow-hidden rounded-[24px] border border-border-theme bg-surface shadow-[0_10px_36px_rgba(28,31,34,0.025)] sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-border-theme">
                <OriginMetric
                  label="Classificadas"
                  value={
                    formatNumber(
                      analytics
                        .summary
                        .classified,
                    )
                  }
                  detail={`${formatNumber(
                    analytics
                      .summary
                      .total,
                  )} total`}
                />

                <OriginMetric
                  label="Operação"
                  value={`${formatNumber(
                    analytics
                      .summary
                      .operationPercentage,
                    1,
                  )}%`}
                  detail={
                    formatNumber(
                      analytics
                        .summary
                        .operation,
                    )
                  }
                  emphasis
                />

                <OriginMetric
                  label="Manutenção"
                  value={`${formatNumber(
                    analytics
                      .summary
                      .maintenancePercentage,
                    1,
                  )}%`}
                  detail={
                    formatNumber(
                      analytics
                        .summary
                        .maintenance,
                    )
                  }
                />

                <OriginMetric
                  label="Não classificadas"
                  value={
                    formatNumber(
                      analytics
                        .summary
                        .unclassified,
                    )
                  }
                  detail={`${formatNumber(
                    analytics
                      .summary
                      .unclassifiedPercentage,
                    1,
                  )}%`}
                  warning={
                    analytics
                      .summary
                      .unclassified >
                    0
                  }
                />

                <OriginMetric
                  label="Revisadas"
                  value={
                    formatNumber(
                      analytics
                        .summary
                        .reviewed,
                    )
                  }
                  detail={`${formatNumber(
                    analytics
                      .summary
                      .reviewedPercentage,
                    1,
                  )}%`}
                />
              </section>

              {/* =============================================
                  DISTRIBUIÇÃO + EVOLUÇÃO
              ============================================== */}

              <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.35fr]">
                <OriginDistribution
                  summary={
                    analytics.summary
                  }
                />

                <OriginTimeline
                  items={
                    analytics.timeline
                  }
                />
              </div>

              {/* =============================================
                  LINHAS
              ============================================== */}

              <div className="mt-5">
                <OriginByLine
                  items={
                    analytics.byLine
                  }
                />
              </div>

              {/* =============================================
                  INVESTIGAÇÃO E REVISÃO
              ============================================== */}

              <section className="mt-5 overflow-hidden rounded-[28px] border border-border-theme bg-surface shadow-[0_14px_44px_rgba(28,31,34,0.035)]">
                <div className="flex items-center justify-between gap-4 border-b border-border-theme px-5 py-3.5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-inverse px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
                      01

                      <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-accent-primary" />
                    </div>

                    <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-text-primary">
                      Investigação e revisão
                    </h2>
                  </div>

                  <span className="hidden text-[9px] font-medium text-text-secondary sm:block">
                    {analytics.editable
                      ? "Revisão manual habilitada"
                      : "Somente leitura"}
                  </span>
                </div>

                <div className="px-5 py-5 sm:px-6 sm:py-6">
                  <FailureOriginAnalysis
                    data={
                      data.failureOrigin
                    }
                    startDate={
                      startDate
                    }
                    endDate={
                      endDate
                    }
                    line={
                      line
                    }
                    equipment={
                      equipment
                    }
                    onChanged={() =>
                      void loadData()
                    }
                  />
                </div>
              </section>
            </>
          )}
      </div>
    </main>
  );
}