"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AnalysisFullscreen,
  type AnalysisFocus,
  type AnalysisLayout,
  type AnalysisOrder,
} from "@/components/reliability/analysis-fullscreen";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  FileDown,
  History,
  LoaderCircle,
  Maximize2,
  Search,
  Target,
  X,
} from "lucide-react";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ReportGeneratorModal,
} from "@/components/reports/report-generator-modal";

import {
  UnitFilter,
} from "@/components/units/unit-filter";

import {
  ReliabilityMaspDialog,
  type ReliabilityMaspSelection,
} from "@/components/reliability/reliability-masp-dialog";

import type {
  FailureOriginSummary,
} from "@/components/reliability/failure-origin-analysis";

import {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  ComplementaryCharts,
} from "@/components/charts/complementary-charts";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
  ReliabilityToolbar,
} from "@/components/reliability/reliability-toolbar";

import {
  useReliabilityFilters,
} from "@/components/reliability/reiliability-filters-provider";

import {
  EquipmentDna as EquipmentHistory,
} from "@/components/reliability/equipment-dna";
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

interface ReliabilityPageProps {
  user: {
    name: string;
  };

  unit: {
    city: string | null;
  };

  /* Só o Analista inicia MASP; o Gestor apenas consulta. */
  canWrite: boolean;
}

interface ReliabilityUnit {
  id: number;
  code: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

interface ParetoItem {
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  percentage: number;
  cumulativePercentage: number;
}

type Quadrant =
  | "CRITICA"
  | "CRITICA_E_CRONICA"
  | "BAIXA_RELEVANCIA"
  | "CRONICA";

interface JackKnifeItem {
  label: string;
  frequency: number;
  downtimeMinutes: number;
  mttr: number;
  quadrant: Quadrant;
}

interface ReliabilityData {
  success?: boolean;
  message?: string;

  analysisLevel:
    | "EQUIPMENT"
    | "FAILURE_MODE";

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

  pareto: ParetoItem[];

  jackKnife: JackKnifeItem[];

  jackKnifeLimits: {
    frequency: number;
    mttr: number;
  };
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

type SelectedChartPoint =
  | {
      type: "PARETO";
      item: ParetoItem;
      index: number;
    }
  | {
      type: "JACK_KNIFE";
      item: JackKnifeItem;
      index: number;
    };

interface ReliabilityDetailDrawerProps {
  selected:
    | SelectedChartPoint
    | null;

  analysisLevel:
    | "EQUIPMENT"
    | "FAILURE_MODE";

  equipment: string;
  frequencyLimit: number;
  mttrLimit: number;

  onClose: () => void;

  onDrillDownEquipment: (
    equipmentName: string,
  ) => void;

  onBackToEquipments:
    () => void;

  /* Ausente para quem só consulta (Gestor). */
  onStartMasp?:
    () => void;

  onOpenEquipmentHistory: (
    equipmentName: string,
  ) => void;
}

interface RawParetoItem {
  label?: unknown;
  occurrences?: unknown;
  downtimeMinutes?: unknown;
  downtime_minutes?: unknown;
  percentage?: unknown;
  cumulativePercentage?: unknown;
  cumulative_percentage?: unknown;
}

interface RawJackKnifeItem {
  label?: unknown;
  frequency?: unknown;
  occurrences?: unknown;
  downtimeMinutes?: unknown;
  downtime_minutes?: unknown;
  mttr?: unknown;
  quadrant?: unknown;
}

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

function firstFinite(
  ...values: unknown[]
): number {
  for (
    const value
    of values
  ) {
    const parsed =
      parseNumber(
        value,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return Number.NaN;
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

function safePositive(
  value: unknown,
  fallback = 1,
): number {
  const parsed =
    parseNumber(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

function safeLabel(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value !==
    "string"
  ) {
    return fallback;
  }

  const result =
    value.trim();

  return (
    result ||
    fallback
  );
}

function normalizeReliabilityUnit(
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
    value as
      Record<
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
    unit.city?.trim() ||
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}

function normalizeLabelKey(
  value: string,
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      "pt-BR",
    );
}

function formatNumber(
  value: number,
  maximumFractionDigits =
    0,
) {
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

function truncate(
  value: string,
  maxLength: number,
) {
  if (
    value.length <=
    maxLength
  ) {
    return value;
  }

  return `${value.slice(
    0,
    Math.max(
      1,
      maxLength - 1,
    ),
  )}…`;
}

function calculateQuadrant(
  frequency: number,
  mttr: number,
  frequencyLimit: number,
  mttrLimit: number,
): Quadrant {
  const highFrequency =
    frequency >=
    frequencyLimit;

  const highMttr =
    mttr >=
    mttrLimit;

  if (
    highFrequency &&
    highMttr
  ) {
    return "CRITICA_E_CRONICA";
  }

  if (
    !highFrequency &&
    highMttr
  ) {
    return "CRITICA";
  }

  if (
    highFrequency &&
    !highMttr
  ) {
    return "CRONICA";
  }

  return "BAIXA_RELEVANCIA";
}

function quadrantColor(
  quadrant: Quadrant,
) {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return "#E41E2B";

    case "CRITICA":
      return "#B4232C";

    case "CRONICA":
      return "#34383D";

    case "BAIXA_RELEVANCIA":

    default:
      return "#9AA0A6";
  }
}

function quadrantLabel(
  quadrant: Quadrant,
): string {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return "Crítico-crônico";

    case "CRITICA":
      return "Crítico";

    case "CRONICA":
      return "Crônico";

    case "BAIXA_RELEVANCIA":

    default:
      return "Conforto";
  }
}

function quadrantDescription(
  quadrant: Quadrant,
): string {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return (
        "Alta frequência e MTTR elevado. " +
        "O ponto combina reincidência com impacto."
      );

    case "CRITICA":
      return (
        "MTTR elevado, mas frequência abaixo do limite. " +
        "As ocorrências são menos frequentes, porém demoradas."
      );

    case "CRONICA":
      return (
        "Frequência elevada e MTTR abaixo do limite. " +
        "O problema se repete com frequência."
      );

    case "BAIXA_RELEVANCIA":

    default:
      return (
        "Frequência e MTTR abaixo dos limites definidos " +
        "para o recorte atual."
      );
  }
}

function normalizeReliabilityData(
  raw: unknown,
): ReliabilityData {
  const source =
    raw &&
    typeof raw ===
      "object"
      ? raw as
        Record<
          string,
          unknown
        >
      : {};

  const filtersRaw =
    source.filters &&
    typeof source.filters ===
      "object"
      ? source
          .filters as
        Record<
          string,
          unknown
        >
      : {};

  const selectedUnitIds =
    Array.isArray(
      filtersRaw
        .selectedUnitIds,
    )
      ? [
          ...new Set(
            filtersRaw
              .selectedUnitIds
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
                  value > 0,
              ),
          ),
        ]
      : [];

  const selectedUnits =
    Array.isArray(
      filtersRaw
        .selectedUnits,
    )
      ? filtersRaw
          .selectedUnits
          .map(
            normalizeReliabilityUnit,
          )
          .filter(
            (
              item,
            ): item is ReliabilityUnit =>
              item !==
              null,
          )
      : [];

  const optionsRaw =
    filtersRaw.options &&
    typeof filtersRaw
      .options ===
      "object"
      ? filtersRaw
          .options as
        Record<
          string,
          unknown
        >
      : {};

  const summaryRaw =
    source.summary &&
    typeof source.summary ===
      "object"
      ? source
          .summary as
        Record<
          string,
          unknown
        >
      : {};

  const failureOriginRaw =
    source.failureOrigin &&
    typeof source.failureOrigin ===
      "object"
      ? source
          .failureOrigin as
        Record<
          string,
          unknown
        >
      : {};

  const limitsRaw =
    source
      .jackKnifeLimits &&
    typeof source
      .jackKnifeLimits ===
      "object"
      ? source
          .jackKnifeLimits as
        Record<
          string,
          unknown
        >
      : {};

  const paretoRaw =
    Array.isArray(
      source.pareto,
    )
      ? source.pareto
      : [];

  const pareto:
    ParetoItem[] =
    paretoRaw.map(
      (
        rawItem,
        index,
      ) => {
        const item =
          (
            rawItem &&
            typeof rawItem ===
              "object"
              ? rawItem
              : {}
          ) as
          RawParetoItem;

        return {
          label:
            safeLabel(
              item.label,
              `Item ${index + 1}`,
            ),

          occurrences:
            safeNonNegative(
              item.occurrences,
              0,
            ),

          downtimeMinutes:
            safeNonNegative(
              firstFinite(
                item.downtimeMinutes,
                item.downtime_minutes,
              ),
              0,
            ),

          percentage:
            safeNonNegative(
              item.percentage,
              0,
            ),

          cumulativePercentage:
            safeNonNegative(
              firstFinite(
                item.cumulativePercentage,
                item.cumulative_percentage,
              ),
              0,
            ),
        };
      },
    );

  const paretoByLabel =
    new Map<
      string,
      ParetoItem
    >();

  for (
    const item
    of pareto
  ) {
    paretoByLabel.set(
      normalizeLabelKey(
        item.label,
      ),
      item,
    );
  }

  const jackRaw =
    Array.isArray(
      source.jackKnife,
    )
      ? source.jackKnife
      : [];

  const reconstructed:
    Array<{
      label: string;
      frequency: number;
      downtimeMinutes: number;
      mttr: number;
    }> =
    [];

  if (
    jackRaw.length >
      0
  ) {
    for (
      let index = 0;
      index <
        jackRaw.length;
      index += 1
    ) {
      const rawItem =
        jackRaw[
          index
        ];

      const item =
        (
          rawItem &&
          typeof rawItem ===
            "object"
            ? rawItem
            : {}
        ) as
        RawJackKnifeItem;

      const label =
        safeLabel(
          item.label,
          `Item ${index + 1}`,
        );

      const paretoItem =
        paretoByLabel.get(
          normalizeLabelKey(
            label,
          ),
        );

      let frequency =
        firstFinite(
          item.frequency,
          item.occurrences,
          paretoItem
            ?.occurrences,
        );

      let downtimeMinutes =
        firstFinite(
          item.downtimeMinutes,
          item.downtime_minutes,
          paretoItem
            ?.downtimeMinutes,
        );

      let mttr =
        firstFinite(
          item.mttr,
        );

      if (
        (
          !Number.isFinite(
            frequency,
          ) ||
          frequency <= 0
        ) &&
        Number.isFinite(
          downtimeMinutes,
        ) &&
        downtimeMinutes >=
          0 &&
        Number.isFinite(
          mttr,
        ) &&
        mttr > 0
      ) {
        frequency =
          downtimeMinutes /
          mttr;
      }

      if (
        (
          !Number.isFinite(
            mttr,
          ) ||
          mttr < 0
        ) &&
        Number.isFinite(
          frequency,
        ) &&
        frequency > 0 &&
        Number.isFinite(
          downtimeMinutes,
        )
      ) {
        mttr =
          downtimeMinutes /
          frequency;
      }

      if (
        (
          !Number.isFinite(
            downtimeMinutes,
          ) ||
          downtimeMinutes <
            0
        ) &&
        Number.isFinite(
          mttr,
        ) &&
        mttr >= 0 &&
        Number.isFinite(
          frequency,
        ) &&
        frequency > 0
      ) {
        downtimeMinutes =
          mttr *
          frequency;
      }

      if (
        (
          !Number.isFinite(
            frequency,
          ) ||
          frequency <= 0
        ) &&
        paretoItem &&
        paretoItem
          .occurrences >
          0
      ) {
        frequency =
          paretoItem
            .occurrences;
      }

      if (
        (
          !Number.isFinite(
            downtimeMinutes,
          ) ||
          downtimeMinutes <
            0
        ) &&
        paretoItem
      ) {
        downtimeMinutes =
          paretoItem
            .downtimeMinutes;
      }

      if (
        (
          !Number.isFinite(
            mttr,
          ) ||
          mttr < 0
        ) &&
        Number.isFinite(
          frequency,
        ) &&
        frequency > 0
      ) {
        mttr =
          (
            Number.isFinite(
              downtimeMinutes,
            )
              ? downtimeMinutes
              : 0
          ) /
          frequency;
      }

      if (
        !Number.isFinite(
          frequency,
        ) ||
        frequency <= 0
      ) {
        continue;
      }

      reconstructed.push({
        label,

        frequency,

        downtimeMinutes:
          Number.isFinite(
            downtimeMinutes,
          ) &&
          downtimeMinutes >= 0
            ? downtimeMinutes
            : 0,

        mttr:
          Number.isFinite(
            mttr,
          ) &&
          mttr >= 0
            ? mttr
            : 0,
      });
    }
  }

  if (
    reconstructed.length ===
      0 &&
    pareto.length > 0
  ) {
    for (
      const item
      of pareto
    ) {
      if (
        item.occurrences <=
          0
      ) {
        continue;
      }

      reconstructed.push({
        label:
          item.label,

        frequency:
          item.occurrences,

        downtimeMinutes:
          item
            .downtimeMinutes,

        mttr:
          item.occurrences >
            0
            ? item
                .downtimeMinutes /
              item.occurrences
            : 0,
      });
    }
  }

  const totalFrequency =
    reconstructed.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.frequency,
      0,
    );

  const totalDowntime =
    reconstructed.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.downtimeMinutes,
      0,
    );

  const calculatedFrequencyLimit =
    reconstructed.length >
      0
      ? Math.max(
          1,
          Math.ceil(
            totalFrequency /
              reconstructed.length,
          ),
        )
      : 1;

  const calculatedMttrLimit =
    totalFrequency > 0
      ? totalDowntime /
        totalFrequency
      : 0;

  const apiFrequencyLimit =
    parseNumber(
      limitsRaw.frequency,
    );

  const apiMttrLimit =
    parseNumber(
      limitsRaw.mttr,
    );

  const frequencyLimit =
    Number.isFinite(
      apiFrequencyLimit,
    ) &&
    apiFrequencyLimit > 0
      ? apiFrequencyLimit
      : calculatedFrequencyLimit;

  const mttrLimit =
    Number.isFinite(
      apiMttrLimit,
    ) &&
    apiMttrLimit >= 0
      ? apiMttrLimit
      : calculatedMttrLimit;

  const jackKnife:
    JackKnifeItem[] =
    reconstructed.map(
      (
        item,
      ) => ({
        label:
          item.label,

        frequency:
          item.frequency,

        downtimeMinutes:
          item
            .downtimeMinutes,

        mttr:
          item.mttr,

        quadrant:
          calculateQuadrant(
            item.frequency,
            item.mttr,
            frequencyLimit,
            mttrLimit,
          ),
      }),
    );

  const lines =
    Array.isArray(
      optionsRaw.lines,
    )
      ? optionsRaw
          .lines
          .filter(
            (
              item,
            ): item is string =>
              typeof item ===
              "string",
          )
      : [];

  const equipments =
    Array.isArray(
      optionsRaw
        .equipments,
    )
      ? optionsRaw
          .equipments
          .filter(
            (
              item,
            ): item is string =>
              typeof item ===
              "string",
          )
      : [];

  const operation =
    safeNonNegative(
      failureOriginRaw
        .operation,
      0,
    );

  const maintenance =
    safeNonNegative(
      failureOriginRaw
        .maintenance,
      0,
    );

  const unclassified =
    safeNonNegative(
      failureOriginRaw
        .unclassified,
      0,
    );

  const classified =
    safeNonNegative(
      failureOriginRaw
        .classified,
      operation +
        maintenance,
    );

  const originTotal =
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
      originTotal > 0
        ? (
            unclassified /
            originTotal
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

    analysisLevel:
      source.analysisLevel ===
        "FAILURE_MODE"
        ? "FAILURE_MODE"
        : "EQUIPMENT",

    filters: {
      selectedUnitIds,
      selectedUnits,

      startDate:
        typeof filtersRaw
          .startDate ===
          "string"
          ? filtersRaw
              .startDate
          : null,

      endDate:
        typeof filtersRaw
          .endDate ===
          "string"
          ? filtersRaw
              .endDate
          : null,

      line:
        typeof filtersRaw
          .line ===
          "string"
          ? filtersRaw.line
          : null,

      equipment:
        typeof filtersRaw
          .equipment ===
          "string"
          ? filtersRaw
              .equipment
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
          totalFrequency,
        ),

      downtimeMinutes:
        safeNonNegative(
          summaryRaw
            .downtimeMinutes,
          totalDowntime,
        ),

      groups:
        safeNonNegative(
          summaryRaw.groups,
          jackKnife.length,
        ),
    },

    failureOrigin: {
      operation,
      maintenance,
      unclassified,
      classified,

      total:
        originTotal,

      operationPercentage,
      maintenancePercentage,
      unclassifiedPercentage,
    },

    pareto,

    jackKnife,

    jackKnifeLimits: {
      frequency:
        frequencyLimit,

      mttr:
        mttrLimit,
    },
  };
}

function activateWithKeyboard(
  event:
    ReactKeyboardEvent<
      SVGGElement
    >,

  action: () => void,
) {
  if (
    event.key ===
      "Enter" ||
    event.key === " "
  ) {
    event.preventDefault();
    action();
  }
}

function ChartTooltip({
  tooltip,
}: {
  tooltip:
    | TooltipState
    | null;
}) {
  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[190px] overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#202327] px-4 py-3.5 text-white shadow-[0_16px_40px_rgba(20,22,25,0.18)]"
      style={{
        left:
          tooltip.x +
          12,

        top:
          tooltip.y +
          12,
      }}
    >
      <p className="max-w-[240px] text-[12px] font-semibold leading-5">
        {tooltip.title}
      </p>

      <div className="mt-2 space-y-1">
        {tooltip.lines.map(
          (
            line,
          ) => (
            <p
              key={line}
              className="text-[11px] text-white/70"
            >
              {line}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </p>

      <p className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-text-primary">
        {value}

        {suffix && (
          <span className="ml-1 text-[12px] font-medium tracking-normal text-text-secondary">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function ProgressMetric({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: number;
}) {
  const safeValue =
    Math.min(
      100,
      Math.max(
        0,
        value,
      ),
    );

  return (
    <div className="mt-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-text-secondary">
            {title}
          </p>

          <p className="mt-1 text-[12px] text-text-secondary">
            {description}
          </p>
        </div>

        <p className="text-[21px] font-semibold tracking-[-0.04em] text-text-primary">
          {formatNumber(
            safeValue,
            1,
          )}
          %
        </p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-[#E41E2B]"
          style={{
            width:
              `${safeValue}%`,
          }}
        />
      </div>
    </div>
  );
}

function LimitComparison({
  label,
  current,
  limit,
  difference,
}: {
  label: string;
  current: string;
  limit: string;
  difference: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-text-secondary">
          {label}
        </span>

        <span className="text-[11px] font-medium text-text-primary">
          {current}
          {" / "}
          {limit}
        </span>
      </div>

      <p className="mt-1 text-[10px] text-text-secondary">
        {difference}
      </p>
    </div>
  );
}

function ReliabilityDetailDrawer({
  selected,
  analysisLevel,
  equipment,
  frequencyLimit,
  mttrLimit,
  onClose,
  onDrillDownEquipment,
  onBackToEquipments,
  onStartMasp,
  onOpenEquipmentHistory,
}: ReliabilityDetailDrawerProps) {
  useEffect(() => {
    if (!selected) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
          "Escape"
      ) {
        onClose();
      }
    }

    const oldOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow =
      "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style
        .overflow =
        oldOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    selected,
    onClose,
  ]);

  if (!selected) {
    return null;
  }

  const isEquipmentLevel =
    analysisLevel ===
      "EQUIPMENT";

  const title =
    selected.item.label;

  const historyEquipmentName =
    isEquipmentLevel
      ? title ===
        "Equipamento não informado"
        ? ""
        : title.trim()
      : equipment.trim();

  const selectedOccurrences =
    selected.type ===
      "PARETO"
      ? selected.item
          .occurrences
      : selected.item
          .frequency;

  let content:
    ReactNode;

  if (
    selected.type ===
      "PARETO"
  ) {
    const item =
      selected.item;

    const averageDowntime =
      item.occurrences > 0
        ? item.downtimeMinutes /
          item.occurrences
        : 0;

    const previousCumulative =
      item.cumulativePercentage -
      item.percentage;

    const crossesEighty =
      previousCumulative <
        80 &&
      item.cumulativePercentage >=
        80;

    const priority =
      item.cumulativePercentage <=
        80 ||
      crossesEighty;

    content = (
      <>
        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-border-theme bg-surface-hover">
          <MetricCell
            label="Ranking"
            value={
              `#${selected.index +
              1}`
            }
          />

          <MetricCell
            label="Ocorrências"
            value={
              formatNumber(
                item.occurrences,
              )
            }
          />

          <MetricCell
            label="Tempo de parada"
            value={
              formatNumber(
                item
                  .downtimeMinutes,
                1,
              )
            }
            suffix="min"
          />

          <MetricCell
            label="Média por ocorrência"
            value={
              formatNumber(
                averageDowntime,
                1,
              )
            }
            suffix="min"
          />
        </div>

        <ProgressMetric
          title="Participação no tempo total"
          description="Impacto individual no período"
          value={
            item.percentage
          }
        />

        <div className="mt-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-text-secondary">
                Percentual acumulado
              </p>

              <p className="mt-1 text-[12px] text-text-secondary">
                Posição dentro da curva de Pareto
              </p>
            </div>

            <p className="text-[21px] font-semibold tracking-[-0.04em] text-text-primary">
              {formatNumber(
                item
                  .cumulativePercentage,
                1,
              )}
              %
            </p>
          </div>

          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-[#2C3034]"
              style={{
                width:
                  `${Math.min(
                    100,
                    item
                      .cumulativePercentage,
                  )}%`,
              }}
            />

            <div className="absolute bottom-0 left-[80%] top-0 w-px bg-[#E41E2B]" />
          </div>
        </div>

        <div className="mt-7 rounded-[16px] bg-surface-elevated p-4">
          <div className="flex gap-3">
            <Target
              size={17}
              className="mt-0.5 shrink-0 text-text-secondary"
            />

            <div>
              <p className="text-[12px] font-semibold text-text-primary">
                {priority
                  ? "Dentro da faixa prioritária do Pareto"
                  : "Após a faixa de 80%"}
              </p>

              <p className="mt-1.5 text-[11px] leading-5 text-text-secondary">
                {crossesEighty
                  ? "Este é o item que ultrapassa o limite acumulado de 80%."
                  : priority
                    ? "Este item integra a concentração principal do tempo de parada."
                    : "Este item aparece após a concentração principal do Pareto."}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  } else {
    const item =
      selected.item;

    const frequencyDifference =
      item.frequency -
      frequencyLimit;

    const mttrDifference =
      item.mttr -
      mttrLimit;

    content = (
      <>
        <div className="mt-7">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{
              color:
                quadrantColor(
                  item.quadrant,
                ),

              backgroundColor:
                `${quadrantColor(
                  item.quadrant,
                )}12`,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  quadrantColor(
                    item.quadrant,
                  ),
              }}
            />

            {quadrantLabel(
              item.quadrant,
            )}
          </div>

          <p className="mt-3 text-[12px] leading-5 text-text-secondary">
            {quadrantDescription(
              item.quadrant,
            )}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-border-theme bg-surface-hover">
          <MetricCell
            label="Nº de falhas"
            value={
              formatNumber(
                item.frequency,
                1,
              )
            }
          />

          <MetricCell
            label="MTTR"
            value={
              formatNumber(
                item.mttr,
                1,
              )
            }
            suffix="min"
          />

          <div className="col-span-2">
            <MetricCell
              label="Tempo total de parada"
              value={
                formatNumber(
                  item
                    .downtimeMinutes,
                  1,
                )
              }
              suffix="min"
            />
          </div>
        </div>

        <div className="mt-7 border-t border-border-theme pt-6">
          <p className="text-[11px] font-semibold text-text-primary">
            Posição em relação aos limites
          </p>

          <div className="mt-4 space-y-5">
            <LimitComparison
              label="Frequência"
              current={
                formatNumber(
                  item.frequency,
                  1,
                )
              }
              limit={
                formatNumber(
                  frequencyLimit,
                  1,
                )
              }
              difference={
                frequencyDifference >=
                  0
                  ? `${formatNumber(
                      frequencyDifference,
                      1,
                    )} acima do limite`
                  : `${formatNumber(
                      Math.abs(
                        frequencyDifference,
                      ),
                      1,
                    )} abaixo do limite`
              }
            />

            <LimitComparison
              label="MTTR"
              current={
                `${formatNumber(
                  item.mttr,
                  1,
                )} min`
              }
              limit={
                `${formatNumber(
                  mttrLimit,
                  1,
                )} min`
              }
              difference={
                mttrDifference >=
                  0
                  ? `${formatNumber(
                      mttrDifference,
                      1,
                    )} min acima do limite`
                  : `${formatNumber(
                      Math.abs(
                        mttrDifference,
                      ),
                      1,
                    )} min abaixo do limite`
              }
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120]"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Fechar detalhes"
        onClick={
          onClose
        }
        className="absolute inset-0 h-full w-full cursor-default bg-black/20 backdrop-blur-[2px]"
      />

      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[460px] flex-col border-l border-border-theme/[0.06] bg-surface shadow-[-18px_0_50px_rgba(0,0,0,0.08)]">
        <div className="flex items-start justify-between gap-5 border-b border-border-theme px-6 py-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-text-secondary">
              {selected.type ===
                "PARETO"
                ? "Detalhe do Pareto"
                : "Detalhe do Jack-Knife"}
            </p>

            <p className="mt-1 text-[11px] text-text-secondary">
              {isEquipmentLevel
                ? "Equipamento"
                : "Modo de falha"}
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover"
          >
            <X
              size={18}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h3 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.035em] text-text-primary">
            {title}
          </h3>

          {equipment &&
            analysisLevel ===
              "FAILURE_MODE" && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-text-secondary">
                <Search
                  size={13}
                />

                {equipment}
              </div>
            )}

          {content}
        </div>

        <div className="space-y-3 border-t border-border-theme px-6 py-5">
          {onStartMasp && (
          <button
            type="button"
            onClick={
              onStartMasp
            }
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#E41E2B] text-[12px] font-semibold text-white hover:bg-[#CF1824]"
          >
            <ClipboardPlus
              size={16}
            />

            Iniciar MASP com{" "}
            {formatNumber(
              selectedOccurrences,
            )}{" "}
            {selectedOccurrences ===
              1
              ? "ocorrência"
              : "ocorrências"}
          </button>
          )}

          {historyEquipmentName && (
            <button
              type="button"
              onClick={() =>
                onOpenEquipmentHistory(
                  historyEquipmentName,
                )
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[#DDE0E3] bg-white text-[12px] font-semibold text-[#3F4449] hover:bg-[#F7F7F6]"
            >
              <History
                size={16}
              />

              Histórico do Equipamento
            </button>
          )}

          {historyEquipmentName && (
            <button
              type="button"
              onClick={() =>
                onOpenEquipmentHistory(
                  historyEquipmentName,
                )
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[#DDE0E3] bg-white text-[12px] font-semibold text-[#3F4449] hover:bg-[#F7F7F6]"
            >
              <History
                size={16}
              />

              Histórico do Equipamento
            </button>
          )}

          {historyEquipmentName && (
            <button
              type="button"
              onClick={() =>
                onOpenEquipmentHistory(
                  historyEquipmentName,
                )
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-[#DDE0E3] bg-white text-[12px] font-semibold text-[#3F4449] hover:bg-[#F7F7F6]"
            >
              <History
                size={16}
              />

              Histórico do Equipamento
            </button>
          )}

          {isEquipmentLevel ? (
            <button
              type="button"
              onClick={() =>
                onDrillDownEquipment(
                  title,
                )
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-border-theme text-[12px] font-semibold text-text-primary hover:bg-surface-hover"
            >
              <Search
                size={15}
              />

              Analisar modos de falha
            </button>
          ) : (
            <button
              type="button"
              onClick={
                onBackToEquipments
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border border-border-theme text-[12px] font-semibold text-text-primary"
            >
              <ArrowLeft
                size={15}
              />

              Voltar para equipamentos
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

const PARETO_ITEMS_PER_PAGE =
  10;

function ParetoChart({
  items,
  onSelect,
}: {
  items: ParetoItem[];

  onSelect: (
    item: ParetoItem,
    index: number,
  ) => void;
}) {
  const [
    tooltip,
    setTooltip,
  ] =
    useState<
      TooltipState | null
    >(null);

  const [
    hoveredGlobalIndex,
    setHoveredGlobalIndex,
  ] =
    useState<
      number | null
    >(null);

  const [
    page,
    setPage,
  ] =
    useState(0);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        items.length /
          PARETO_ITEMS_PER_PAGE,
      ),
    );

  const safePage =
    Math.min(
      page,
      totalPages - 1,
    );

  const startIndex =
    safePage *
    PARETO_ITEMS_PER_PAGE;

  const endIndex =
    Math.min(
      startIndex +
        PARETO_ITEMS_PER_PAGE,
      items.length,
    );

  const visibleItems =
    items.slice(
      startIndex,
      endIndex,
    );

  useEffect(() => {
    const timeoutId =
      window.setTimeout(
        () => {
          setPage(0);

          setTooltip(
            null,
          );

          setHoveredGlobalIndex(
            null,
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );
    };
  }, [
    items,
  ]);

  if (
    items.length === 0
  ) {
    return (
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      <div className="flex min-h-[420px] items-center justify-center text-[13px] text-text-secondary">
=======
      <div className="flex min-h-[430px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
=======
      <div className="flex min-h-[430px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
=======
      <div className="flex min-h-[430px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
        Não há dados para o período selecionado.
      </div>
    );
  }

  const width =
    1160;

  const height =
    500;

  const left =
    76;

  const right =
    72;

  const top =
    52;

  const bottom =
    128;

  const plotWidth =
    width -
    left -
    right;

  const plotHeight =
    height -
    top -
    bottom;

  const maxDowntime =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          item
            .downtimeMinutes,
      ),
      1,
    );

  const axisMaximum =
    maxDowntime *
    1.12;

  const slotWidth =
    plotWidth /
    PARETO_ITEMS_PER_PAGE;

  const barWidth =
    Math.min(
      72,
      slotWidth *
        0.68,
    );

  const topItem =
    items[0] ??
    null;

  const eightyIndex =
    items.findIndex(
      (
        item,
      ) =>
        item.cumulativePercentage >=
        80,
    );

  const contributorsTo80 =
    eightyIndex >= 0
      ? eightyIndex + 1
      : items.length;

  const vitalShare =
    items.length > 0
      ? (
          contributorsTo80 /
          items.length
        ) *
        100
      : 0;

  function yForMinutes(
    minutes: number,
  ) {
    return (
      top +
      plotHeight -
      (
        minutes /
        axisMaximum
      ) *
        plotHeight
    );
  }

  function yForPercentage(
    percentage: number,
  ) {
    return (
      top +
      plotHeight -
      (
        Math.min(
          100,
          Math.max(
            0,
            percentage,
          ),
        ) /
        100
      ) *
        plotHeight
    );
  }

  const points =
    visibleItems.map(
      (
        item,
        index,
      ) => ({
        x:
          left +
          slotWidth *
            index +
          slotWidth /
            2,

        y:
          yForPercentage(
            item
              .cumulativePercentage,
          ),
      }),
    );

  const cumulativePath =
    points
      .map(
        (
          point,
          index,
        ) =>
          `${index === 0
            ? "M"
            : "L"} ${point.x} ${point.y}`,
      )
      .join(
        " ",
      );

  const minuteFractions =
    [
      0,
      0.25,
      0.5,
      0.75,
      1,
    ];

  const percentageTicks =
    [
      0,
      20,
      40,
      60,
      80,
      100,
    ];

  const eightyY =
    yForPercentage(
      80,
    );

  const paretoAnimationKey =
    visibleItems
      .map(
        (
          item,
        ) =>
          `${item.label}:${item.downtimeMinutes}:${item.cumulativePercentage}`,
      )
      .join(
        "|",
      );

  function goToPreviousPage() {
    setPage(
      (
        current,
      ) =>
        Math.max(
          0,
          current - 1,
        ),
    );

    setTooltip(
      null,
    );

    setHoveredGlobalIndex(
      null,
    );
  }

  function goToNextPage() {
    setPage(
      (
        current,
      ) =>
        Math.min(
          totalPages - 1,
          current + 1,
        ),
    );

    setTooltip(
      null,
    );

    setHoveredGlobalIndex(
      null,
    );
  }

  return (
    <div>
      

      <div
        className="relative overflow-hidden rounded-[24px] border border-black/[0.045] bg-[#FCFCFB] px-2 pb-1 pt-2 sm:px-3"
        onMouseLeave={() => {
          setTooltip(
            null,
          );

          setHoveredGlobalIndex(
            null,
          );
        }}
      >
        <ChartTooltip
          tooltip={
            tooltip
          }
        />

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Pareto do tempo de parada. Exibindo itens ${startIndex + 1} a ${endIndex} de ${items.length}.`}
          onMouseMove={(
            event,
          ) => {
            if (
              !tooltip
            ) {
              return;
            }

            const rect =
              event
                .currentTarget
                .getBoundingClientRect();

            setTooltip(
              (
                current,
              ) =>
                current
                  ? {
                      ...current,

                      x:
                        event.clientX -
                        rect.left,

                      y:
                        event.clientY -
                        rect.top,
                    }
                  : null,
            );
          }}
        >
          <defs>
            <linearGradient
              id="pareto-vital-gradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#E41E2B"
              />

              <stop
                offset="100%"
                stopColor="#C81723"
              />
            </linearGradient>

            <filter
              id="pareto-red-glow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="4"
                floodColor="#E41E2B"
                floodOpacity="0.18"
              />
            </filter>
          </defs>

          {minuteFractions.map(
            (
              fraction,
            ) => {
              const minutes =
                axisMaximum *
                fraction;

              const y =
                yForMinutes(
                  minutes,
                );

              return (
                <g
                  key={
                    fraction
                  }
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
                    stroke="#ECEEEF"
                  />

                  <text
                    x={
                      left -
                      14
                    }
                    y={
                      y +
                      4
                    }
                    textAnchor="end"
                    fontSize="10"
                    fill="#92979D"
                  >
                    {formatNumber(
                      minutes,
                    )}
                  </text>
                </g>
              );
            },
          )}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            return (
              <g
                key={
                  fraction
                }
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
                />
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
          {percentageTicks.map(
            (
              percentage,
            ) => {
              const y =
                yForPercentage(
                  percentage,
                );
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

              return (
                <text
                  key={
                    percentage
                  }
                  x={
                    width -
                    right +
                    14
                  }
                  y={
                    y +
                    4
                  }
                  fontSize="10"
                  fontWeight={
                    percentage ===
                      80
                      ? "700"
                      : "400"
                  }
                  fill={
                    percentage ===
                      80
                      ? "#C91D28"
                      : "#92979D"
                  }
                >
                  {percentage}%
                </text>
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
              eightyY
            }
            y2={
              eightyY
            }
            stroke="#E41E2B"
            strokeWidth="1.6"
            strokeDasharray="8 7"
            opacity="0.78"
          />

          <g>
            <rect
              x={
                width -
                right -
                74
              }
              y={
                eightyY -
                25
              }
              width="62"
              height="19"
              rx="9.5"
              fill="#FFF0F1"
            />

            <text
              x={
                width -
                right -
                43
              }
              y={
                eightyY -
                12
              }
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#C91D28"
            >
              LIMITE 80%
            </text>
          </g>

          {visibleItems.map(
            (
              item,
              localIndex,
            ) => {
              const globalIndex =
                startIndex +
                localIndex;

              const x =
                left +
                slotWidth *
                  localIndex +
                (
                  slotWidth -
                  barWidth
                ) /
                  2;

              const y =
                yForMinutes(
                  item
                    .downtimeMinutes,
                );

              const heightValue =
                top +
                plotHeight -
                y;

              const centerX =
                x +
                barWidth /
                  2;

              const belongsToVitalFew =
                globalIndex <
                contributorsTo80;

              const active =
                hoveredGlobalIndex ===
                globalIndex;

              const dimmed =
                hoveredGlobalIndex !==
                  null &&
                !active;

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                      `${formatNumber(
                        item
                          .occurrences,
                      )} ocorrências`,

                      `${formatNumber(
                        item.percentage,
                        1,
                      )}% do total`,

                      `${formatNumber(
                        item
                          .cumulativePercentage,
                        1,
                      )}% acumulado`,
                    ],
                  })
                }
              >
                <rect
                  x={
                    x
                  }
                  y={
                    y
                  }
                  width={
                    barWidth
                  }
                  height={
                    heightValue
                  }
                  rx="3"
                  fill="#E41E2B"
                />

                <text
                  x={
                    centerX
                  }
                  y={
                    Math.max(
                      top +
                        12,
                      y -
                        9,
                    )
                  }
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#5E6369"
                  className="pointer-events-none"
                >
                  {formatNumber(
                    item
                      .downtimeMinutes,
                  )}
                </text>

                <text
                  x={
                    centerX
                  }
                  y={
                    top +
                    plotHeight +
                    24
                  }
                  textAnchor="end"
                  transform={
                    `rotate(-38 ${centerX} ${
                      top +
                      plotHeight +
                      24
                    })`
                  }
                  fontSize="10"
                  fill="#70757B"
                  className="pointer-events-none"
                >
                  {truncate(
                    item.label,
                    24,
                  )}
                </text>
              </g>
            );
          },
        )}

        <path
          d={
            cumulativePath
          }
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />

        {points.map(
          (
            point,
            localIndex,
          ) => {
            const item =
              visibleItems[
                localIndex
              ];

            const globalIndex =
              startIndex +
              localIndex;

            return (
              <g
                key={
                  globalIndex
                }
                className="cursor-pointer"
                onClick={() =>
=======
              const open =
                () =>
>>>>>>> origin/marques
=======
              const open =
                () =>
>>>>>>> origin/marques
=======
              const open =
                () =>
>>>>>>> origin/marques
                  onSelect(
                    item,
                    globalIndex,
                  );

              const begin =
                `${Math.min(
                  localIndex *
                    0.035,
                  0.28,
                )}s`;

              return (
                <g
                  key={`${paretoAnimationKey}-${item.label}-${globalIndex}`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  opacity={
                    dimmed
                      ? 0.42
                      : 1
<<<<<<< HEAD
<<<<<<< HEAD
                  }
                  onClick={
                    open
                  }
                  onKeyDown={(
                    event,
                  ) =>
                    activateWithKeyboard(
                      event,
                      open,
                    )
                  }
                  onMouseEnter={() => {
                    setHoveredGlobalIndex(
                      globalIndex,
                    );

                    setTooltip({
                      x:
                        centerX,

                      y,

                      title:
                        item.label,

                      lines: [
                        `#${globalIndex + 1} no ranking`,

                        `${formatNumber(
                          item
                            .downtimeMinutes,
                          1,
                        )} min de parada`,

                        `${formatNumber(
                          item
                            .occurrences,
                        )} ocorrências`,

                        `${formatNumber(
                          item.percentage,
                          1,
                        )}% do total`,

                        `${formatNumber(
                          item
                            .cumulativePercentage,
                          1,
                        )}% acumulado`,
                      ],
                    });
                  }}
                >
                  <rect
                    x={
                      x
                    }
                    y={
                      y
                    }
                    width={
                      barWidth
                    }
                    height={
                      heightValue
                    }
                    rx="7"
                    fill={
                      belongsToVitalFew
                        ? "url(#pareto-vital-gradient)"
                        : "#34383D"
                    }
                    filter={
                      active &&
                      belongsToVitalFew
                        ? "url(#pareto-red-glow)"
                        : undefined
                    }
                  >
                    <animate
                      attributeName="y"
                      from={
                        top +
                        plotHeight
                      }
                      to={
                        y
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="height"
                      from="0"
                      to={
                        heightValue
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.34s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />
                  </rect>

                  {active && (
                    <rect
                      x={
                        x -
                        4
                      }
                      y={
                        Math.max(
                          top,
                          y -
                            4,
                        )
                      }
                      width={
                        barWidth +
                        8
                      }
                      height={
                        heightValue +
                        4
                      }
                      rx="10"
                      fill="none"
                      stroke={
                        belongsToVitalFew
                          ? "#E41E2B"
                          : "#202327"
                      }
                      strokeWidth="1.5"
                      opacity="0.22"
                    />
                  )}

                  <text
                    x={
                      centerX
                    }
                    y={
                      Math.max(
                        top +
                          12,
                        y -
                          9,
                      )
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={
                      active
                        ? belongsToVitalFew
                          ? "#C81723"
                          : "#202327"
                        : "#62676D"
                    }
                    className="pointer-events-none"
                  >
                    {formatNumber(
                      item
                        .downtimeMinutes,
                    )}
                  </text>

                  <text
                    x={
                      centerX
                    }
                    y={
                      top +
                      plotHeight +
                      24
                    }
                    textAnchor="end"
                    transform={`rotate(-38 ${centerX} ${
                      top +
                      plotHeight +
                      24
                    })`}
                    fontSize="10"
                    fontWeight={
                      active
                        ? "700"
                        : "400"
                    }
                    fill={
                      active
                        ? "#202327"
                        : "#70757B"
                    }
                    className="pointer-events-none"
                  >
                    {truncate(
                      item.label,
                      24,
                    )}
                  </text>
                </g>
              );
            },
          )}

          <path
            key={`pareto-line-${paretoAnimationKey}`}
            d={
              cumulativePath
            }
            fill="none"
            stroke="#202327"
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="0"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur="0.82s"
              begin="0.18s"
              fill="freeze"
            />

            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.38s"
              begin="0.12s"
              fill="freeze"
            />
          </path>

          {points.map(
            (
              point,
              localIndex,
            ) => {
              const item =
                visibleItems[
                  localIndex
                ];

              const globalIndex =
                startIndex +
                localIndex;

              const active =
                hoveredGlobalIndex ===
                globalIndex;

              return (
                <g
                  key={`pareto-point-${paretoAnimationKey}-${globalIndex}`}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredGlobalIndex(
                      globalIndex,
                    )
                  }
<<<<<<< HEAD
                  r="4.5"
                  fill="var(--text-primary)"
                  stroke="white"
                  strokeWidth="1.5"
                  className="pointer-events-none"
                />
              </g>
            );
          },
        )}
=======
=======
                  }
                  onClick={
                    open
                  }
                  onKeyDown={(
                    event,
                  ) =>
                    activateWithKeyboard(
                      event,
                      open,
                    )
                  }
                  onMouseEnter={() => {
                    setHoveredGlobalIndex(
                      globalIndex,
                    );

                    setTooltip({
                      x:
                        centerX,

                      y,

                      title:
                        item.label,

                      lines: [
                        `#${globalIndex + 1} no ranking`,

                        `${formatNumber(
                          item
                            .downtimeMinutes,
                          1,
                        )} min de parada`,

                        `${formatNumber(
                          item
                            .occurrences,
                        )} ocorrências`,

                        `${formatNumber(
                          item.percentage,
                          1,
                        )}% do total`,

                        `${formatNumber(
                          item
                            .cumulativePercentage,
                          1,
                        )}% acumulado`,
                      ],
                    });
                  }}
                >
                  <rect
                    x={
                      x
                    }
                    y={
                      y
                    }
                    width={
                      barWidth
                    }
                    height={
                      heightValue
                    }
                    rx="7"
                    fill={
                      belongsToVitalFew
                        ? "url(#pareto-vital-gradient)"
                        : "#34383D"
                    }
                    filter={
                      active &&
                      belongsToVitalFew
                        ? "url(#pareto-red-glow)"
                        : undefined
                    }
                  >
                    <animate
                      attributeName="y"
                      from={
                        top +
                        plotHeight
                      }
                      to={
                        y
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="height"
                      from="0"
                      to={
                        heightValue
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.34s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />
                  </rect>

                  {active && (
                    <rect
                      x={
                        x -
                        4
                      }
                      y={
                        Math.max(
                          top,
                          y -
                            4,
                        )
                      }
                      width={
                        barWidth +
                        8
                      }
                      height={
                        heightValue +
                        4
                      }
                      rx="10"
                      fill="none"
                      stroke={
                        belongsToVitalFew
                          ? "#E41E2B"
                          : "#202327"
                      }
                      strokeWidth="1.5"
                      opacity="0.22"
                    />
                  )}

                  <text
                    x={
                      centerX
                    }
                    y={
                      Math.max(
                        top +
                          12,
                        y -
                          9,
                      )
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={
                      active
                        ? belongsToVitalFew
                          ? "#C81723"
                          : "#202327"
                        : "#62676D"
                    }
                    className="pointer-events-none"
                  >
                    {formatNumber(
                      item
                        .downtimeMinutes,
                    )}
                  </text>

                  <text
                    x={
                      centerX
                    }
                    y={
                      top +
                      plotHeight +
                      24
                    }
                    textAnchor="end"
                    transform={`rotate(-38 ${centerX} ${
                      top +
                      plotHeight +
                      24
                    })`}
                    fontSize="10"
                    fontWeight={
                      active
                        ? "700"
                        : "400"
                    }
                    fill={
                      active
                        ? "#202327"
                        : "#70757B"
                    }
                    className="pointer-events-none"
                  >
                    {truncate(
                      item.label,
                      24,
                    )}
                  </text>
                </g>
              );
            },
          )}

          <path
            key={`pareto-line-${paretoAnimationKey}`}
            d={
              cumulativePath
            }
            fill="none"
            stroke="#202327"
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="0"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur="0.82s"
              begin="0.18s"
              fill="freeze"
            />

            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.38s"
              begin="0.12s"
              fill="freeze"
            />
          </path>

          {points.map(
            (
              point,
              localIndex,
            ) => {
              const item =
                visibleItems[
                  localIndex
                ];

              const globalIndex =
                startIndex +
                localIndex;

              const active =
                hoveredGlobalIndex ===
                globalIndex;

              return (
                <g
                  key={`pareto-point-${paretoAnimationKey}-${globalIndex}`}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredGlobalIndex(
                      globalIndex,
                    )
                  }
>>>>>>> origin/marques
                  onClick={() =>
                    onSelect(
                      item,
                      globalIndex,
                    )
                  }
                >
                  <circle
                    cx={
                      point.x
                    }
                    cy={
                      point.y
                    }
                    r="14"
                    fill="transparent"
                  />
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

                  {active && (
                    <circle
                      cx={
                        point.x
                      }
                      cy={
                        point.y
                      }
                      r="8"
                      fill="#E41E2B"
                      opacity="0.10"
                    />
                  )}

                  <circle
                    cx={
                      point.x
                    }
                    cy={
                      point.y
                    }
                    r={
                      active
                        ? 5.5
                        : 4.3
                    }
                    fill={
                      active
                        ? "#E41E2B"
                        : "#202327"
                    }
                    stroke="white"
                    strokeWidth="1.7"
                    className="pointer-events-none"
                  >
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.32s"
                      begin={`${0.34 +
                      Math.min(
                        localIndex *
                          0.025,
                        0.2,
                      )}s`}
                      fill="freeze"
                    />
                  </circle>
                </g>
              );
            },
          )}

          <line
            x1={
              left
            }
            x2={
              left
            }
            y1={
              top
            }
            y2={
              top +
              plotHeight
            }
            stroke="#B7BBC0"
          />

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
            stroke="#B7BBC0"
          />

<<<<<<< HEAD
<<<<<<< HEAD
      <div className="mt-2 flex flex-col gap-3 border-t border-border-theme px-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium text-text-primary">
=======
          <text
            x={
              left
            }
            y="24"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Tempo de parada (min)
          </text>

          <text
            x={
              width -
              right
            }
            y="24"
            textAnchor="end"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Percentual acumulado
          </text>
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold text-[#555A60]">
>>>>>>> origin/marques
=======
          <text
            x={
              left
            }
            y="24"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Tempo de parada (min)
          </text>

          <text
            x={
              width -
              right
            }
            y="24"
            textAnchor="end"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Percentual acumulado
          </text>
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold text-[#555A60]">
>>>>>>> origin/marques
=======
                  }
                  onClick={
                    open
                  }
                  onKeyDown={(
                    event,
                  ) =>
                    activateWithKeyboard(
                      event,
                      open,
                    )
                  }
                  onMouseEnter={() => {
                    setHoveredGlobalIndex(
                      globalIndex,
                    );

                    setTooltip({
                      x:
                        centerX,

                      y,

                      title:
                        item.label,

                      lines: [
                        `#${globalIndex + 1} no ranking`,

                        `${formatNumber(
                          item
                            .downtimeMinutes,
                          1,
                        )} min de parada`,

                        `${formatNumber(
                          item
                            .occurrences,
                        )} ocorrências`,

                        `${formatNumber(
                          item.percentage,
                          1,
                        )}% do total`,

                        `${formatNumber(
                          item
                            .cumulativePercentage,
                          1,
                        )}% acumulado`,
                      ],
                    });
                  }}
                >
                  <rect
                    x={
                      x
                    }
                    y={
                      y
                    }
                    width={
                      barWidth
                    }
                    height={
                      heightValue
                    }
                    rx="7"
                    fill={
                      belongsToVitalFew
                        ? "url(#pareto-vital-gradient)"
                        : "#34383D"
                    }
                    filter={
                      active &&
                      belongsToVitalFew
                        ? "url(#pareto-red-glow)"
                        : undefined
                    }
                  >
                    <animate
                      attributeName="y"
                      from={
                        top +
                        plotHeight
                      }
                      to={
                        y
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="height"
                      from="0"
                      to={
                        heightValue
                      }
                      dur="0.58s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.34s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />
                  </rect>

                  {active && (
                    <rect
                      x={
                        x -
                        4
                      }
                      y={
                        Math.max(
                          top,
                          y -
                            4,
                        )
                      }
                      width={
                        barWidth +
                        8
                      }
                      height={
                        heightValue +
                        4
                      }
                      rx="10"
                      fill="none"
                      stroke={
                        belongsToVitalFew
                          ? "#E41E2B"
                          : "#202327"
                      }
                      strokeWidth="1.5"
                      opacity="0.22"
                    />
                  )}

                  <text
                    x={
                      centerX
                    }
                    y={
                      Math.max(
                        top +
                          12,
                        y -
                          9,
                      )
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill={
                      active
                        ? belongsToVitalFew
                          ? "#C81723"
                          : "#202327"
                        : "#62676D"
                    }
                    className="pointer-events-none"
                  >
                    {formatNumber(
                      item
                        .downtimeMinutes,
                    )}
                  </text>

                  <text
                    x={
                      centerX
                    }
                    y={
                      top +
                      plotHeight +
                      24
                    }
                    textAnchor="end"
                    transform={`rotate(-38 ${centerX} ${
                      top +
                      plotHeight +
                      24
                    })`}
                    fontSize="10"
                    fontWeight={
                      active
                        ? "700"
                        : "400"
                    }
                    fill={
                      active
                        ? "#202327"
                        : "#70757B"
                    }
                    className="pointer-events-none"
                  >
                    {truncate(
                      item.label,
                      24,
                    )}
                  </text>
                </g>
              );
            },
          )}

          <path
            key={`pareto-line-${paretoAnimationKey}`}
            d={
              cumulativePath
            }
            fill="none"
            stroke="#202327"
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="0"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur="0.82s"
              begin="0.18s"
              fill="freeze"
            />

            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.38s"
              begin="0.12s"
              fill="freeze"
            />
          </path>

          {points.map(
            (
              point,
              localIndex,
            ) => {
              const item =
                visibleItems[
                  localIndex
                ];

              const globalIndex =
                startIndex +
                localIndex;

              const active =
                hoveredGlobalIndex ===
                globalIndex;

              return (
                <g
                  key={`pareto-point-${paretoAnimationKey}-${globalIndex}`}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredGlobalIndex(
                      globalIndex,
                    )
                  }
                  onClick={() =>
                    onSelect(
                      item,
                      globalIndex,
                    )
                  }
                >
                  <circle
                    cx={
                      point.x
                    }
                    cy={
                      point.y
                    }
                    r="14"
                    fill="transparent"
                  />

                  {active && (
                    <circle
                      cx={
                        point.x
                      }
                      cy={
                        point.y
                      }
                      r="8"
                      fill="#E41E2B"
                      opacity="0.10"
                    />
                  )}

                  <circle
                    cx={
                      point.x
                    }
                    cy={
                      point.y
                    }
                    r={
                      active
                        ? 5.5
                        : 4.3
                    }
                    fill={
                      active
                        ? "#E41E2B"
                        : "#202327"
                    }
                    stroke="white"
                    strokeWidth="1.7"
                    className="pointer-events-none"
                  >
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.32s"
                      begin={`${0.34 +
                      Math.min(
                        localIndex *
                          0.025,
                        0.2,
                      )}s`}
                      fill="freeze"
                    />
                  </circle>
                </g>
              );
            },
          )}

          <line
            x1={
              left
            }
            x2={
              left
            }
            y1={
              top
            }
            y2={
              top +
              plotHeight
            }
            stroke="#B7BBC0"
          />

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
            stroke="#B7BBC0"
          />

          <text
            x={
              left
            }
            y="24"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Tempo de parada (min)
          </text>

          <text
            x={
              width -
              right
            }
            y="24"
            textAnchor="end"
            fontSize="10"
            fontWeight="600"
            fill="#777C82"
          >
            Percentual acumulado
          </text>
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold text-[#555A60]">
>>>>>>> origin/marques
            Exibindo{" "}
            {startIndex + 1}
            –
            {endIndex} de{" "}
            {items.length} categorias
          </p>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          <p className="mt-0.5 text-[10px] text-text-secondary">
            Ordenação global por tempo de parada · acumulado preservado entre páginas
=======
          <p className="mt-1 text-[9px] text-[#9A9FA5]">
            Vermelho = categorias que formam a faixa vital até 80% · grafite = cauda do Pareto
>>>>>>> origin/marques
=======
          <p className="mt-1 text-[9px] text-[#9A9FA5]">
            Vermelho = categorias que formam a faixa vital até 80% · grafite = cauda do Pareto
>>>>>>> origin/marques
=======
          <p className="mt-1 text-[9px] text-[#9A9FA5]">
            Vermelho = categorias que formam a faixa vital até 80% · grafite = cauda do Pareto
>>>>>>> origin/marques
          </p>
        </div>

        {totalPages >
          1 && (
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                goToPreviousPage
              }
              disabled={
                safePage ===
                0
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-theme bg-surface px-3 text-[11px] font-medium text-text-primary transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Página anterior do Pareto"
            >
              <ChevronLeft
                size={14}
              />
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
            <div className="inline-flex items-center rounded-full bg-[#F1F1F0] p-1">
              <button
                type="button"
                onClick={
                  goToPreviousPage
                }
                disabled={
                  safePage ===
                  0
                }
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[9px] font-semibold text-[#62676D] transition hover:bg-white hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft
                  size={13}
                />
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

                Anterior
              </button>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            <span className="min-w-[64px] text-center text-[11px] font-semibold text-text-primary">
              {safePage + 1}
              {" / "}
              {totalPages}
            </span>

            <button
              type="button"
              onClick={
                goToNextPage
              }
              disabled={
                safePage >=
                totalPages -
                  1
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-theme bg-surface px-3 text-[11px] font-medium text-text-primary transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Próxima página do Pareto"
            >
              Próximo
=======
              <span className="min-w-[58px] text-center text-[9px] font-bold text-[#3A3E43]">
                {safePage + 1}
                {" / "}
                {totalPages}
              </span>

              <button
                type="button"
                onClick={
                  goToNextPage
                }
                disabled={
                  safePage >=
                  totalPages -
                    1
                }
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[9px] font-semibold text-[#62676D] transition hover:bg-white hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Próximo
>>>>>>> origin/marques

=======
              <span className="min-w-[58px] text-center text-[9px] font-bold text-[#3A3E43]">
                {safePage + 1}
                {" / "}
                {totalPages}
              </span>

              <button
                type="button"
                onClick={
                  goToNextPage
                }
                disabled={
                  safePage >=
                  totalPages -
                    1
                }
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[9px] font-semibold text-[#62676D] transition hover:bg-white hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Próximo

>>>>>>> origin/marques
=======
              <span className="min-w-[58px] text-center text-[9px] font-bold text-[#3A3E43]">
                {safePage + 1}
                {" / "}
                {totalPages}
              </span>

              <button
                type="button"
                onClick={
                  goToNextPage
                }
                disabled={
                  safePage >=
                  totalPages -
                    1
                }
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[9px] font-semibold text-[#62676D] transition hover:bg-white hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Próximo

>>>>>>> origin/marques
                <ChevronRight
                  size={13}
                />
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

function JackKnifeChart({
  items,
  frequencyLimit,
  mttrLimit,
  onSelect,
}: {
  items: JackKnifeItem[];
  frequencyLimit: number;
  mttrLimit: number;

  onSelect: (
    item: JackKnifeItem,
    index: number,
  ) => void;
}) {
  const [
    tooltip,
    setTooltip,
  ] =
    useState<
      TooltipState | null
    >(null);

  const [
    hoveredIndex,
    setHoveredIndex,
  ] =
    useState<
      number | null
    >(null);

  if (
    items.length ===
      0
  ) {
    return (
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      <div className="flex min-h-[430px] items-center justify-center text-[13px] text-text-secondary">
=======
      <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
=======
      <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
=======
      <div className="flex min-h-[520px] items-center justify-center rounded-[24px] border border-dashed border-black/[0.07] bg-[#FAFAF9] text-[12px] text-[#93989E]">
>>>>>>> origin/marques
        Nenhuma ocorrência foi encontrada para o recorte selecionado.
      </div>
    );
  }

  const width =
    1180;

  const height =
    620;

  const left =
    92;

  const right =
    52;

  const top =
    54;

  const bottom =
    88;

  const plotWidth =
    width -
    left -
    right;

  const plotHeight =
    height -
    top -
    bottom;

  const minX =
    1;

  const minY =
    0.1;

  const safeFrequencyLimit =
    safePositive(
      frequencyLimit,
      1,
    );

  const safeMttrLimit =
    Math.max(
      minY,
      safeNonNegative(
        mttrLimit,
        minY,
      ),
    );

  const maximumFrequency =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          Math.max(
            minX,
            item.frequency,
          ),
      ),
      safeFrequencyLimit,
      1,
    );

  const maximumMttr =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          Math.max(
            minY,
            item.mttr,
          ),
      ),
      safeMttrLimit,
      minY,
    );

  const maximumDowntime =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          Math.max(
            0,
            item.downtimeMinutes,
          ),
      ),
      1,
    );

  const maxX =
    Math.max(
      10,
      10 **
        Math.ceil(
          Math.log10(
            maximumFrequency,
          ),
        ),
    );

  const maxY =
    Math.max(
      1,
      10 **
        Math.ceil(
          Math.log10(
            maximumMttr,
          ),
        ),
    );

  const logXMin =
    Math.log10(
      minX,
    );

  const logXMax =
    Math.log10(
      maxX,
    );

  const logYMin =
    Math.log10(
      minY,
    );

  const logYMax =
    Math.log10(
      maxY,
    );

  function xFor(
    frequency: number,
  ) {
    const safe =
      Math.max(
        minX,
        frequency,
      );

    return (
      left +
      (
        (
          Math.log10(
            safe,
          ) -
          logXMin
        ) /
        (
          logXMax -
          logXMin
        )
      ) *
        plotWidth
    );
  }

  function yFor(
    mttr: number,
  ) {
    const safe =
      Math.max(
        minY,
        mttr,
      );

    return (
      top +
      plotHeight -
      (
        (
          Math.log10(
            safe,
          ) -
          logYMin
        ) /
        (
          logYMax -
          logYMin
        )
      ) *
        plotHeight
    );
  }

  function radiusFor(
    downtimeMinutes: number,
  ) {
    const ratio =
      Math.min(
        1,
        Math.max(
          0,
          downtimeMinutes /
            maximumDowntime,
        ),
      );

    return (
      4.8 +
      Math.sqrt(
        ratio,
      ) *
        4.2
    );
  }

  const dividerX =
    xFor(
      safeFrequencyLimit,
    );

  const dividerY =
    yFor(
      safeMttrLimit,
    );

  const xTicks:
    number[] =
    [];

  for (
    let tick =
      1;
    tick <=
      maxX;
    tick *=
      10
  ) {
    xTicks.push(
      tick,
    );
  }

  const yTicks:
    number[] =
    [];

  for (
    let exponent =
      -1;
    10 **
      exponent <=
      maxY;
    exponent +=
      1
  ) {
    yTicks.push(
      10 **
        exponent,
    );
  }

  const frequencyGroups =
    new Map<
      string,
      number[]
    >();

  items.forEach(
    (
      item,
      index,
    ) => {
      const key =
        item.frequency.toFixed(
          6,
        );

      const indexes =
        frequencyGroups.get(
          key,
        ) ?? [];

      indexes.push(
        index,
      );

      frequencyGroups.set(
        key,
        indexes,
      );
    },
  );

  function xForItem(
    item: JackKnifeItem,
    index: number,
  ) {
    const baseX =
      xFor(
        item.frequency,
      );

    const indexes =
      frequencyGroups.get(
        item.frequency.toFixed(
          6,
        ),
      ) ?? [
        index,
      ];

    if (
      indexes.length <=
        1
    ) {
      return baseX;
    }

    const position =
      indexes.indexOf(
        index,
      );

    const center =
      (
        indexes.length -
        1
      ) /
      2;

    const offset =
      Math.max(
        -8,
        Math.min(
          8,
          (
            position -
            center
          ) *
            2.25,
        ),
      );

    return Math.max(
      left +
        2,
      Math.min(
        width -
          right -
          2,
        baseX +
          offset,
      ),
    );
  }

  const animationKey =
    items
      .map(
        (
          item,
        ) =>
          `${item.label}:${item.frequency}:${item.mttr}:${item.downtimeMinutes}`,
      )
      .join(
        "|",
      );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A0A5AA]">
            Matriz de criticidade
          </p>

          <p className="mt-1 text-[11px] text-[#747A80]">
            Frequência × MTTR. O tamanho do ponto representa o tempo total de parada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[8px] font-medium text-[#92979D]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E41E2B]" />
            Crítico-crônico
          </span>

          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#B4232C]" />
            Crítico
          </span>

          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#34383D]" />
            Crônico
          </span>

          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#A0A5AA]" />
            Conforto
          </span>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-[26px] border border-black/[0.05] bg-white"
        onMouseLeave={() => {
          setTooltip(
            null,
          );

          setHoveredIndex(
            null,
          );
        }}
      >
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        {xTicks.map(
          (
            tick,
          ) => {
            const x =
              xFor(
                tick,
              );

            return (
              <g
                key={
                  `x-${tick}`
                }
              >
                <line
                  x1={
                    x
                  }
                  x2={
                    x
                  }
                  y1={
                    top
                  }
                  y2={
                    top +
                    plotHeight
                  }
                  stroke="var(--chart-grid)"
                />

                <text
                  x={
                    x
                  }
                  y={
                    top +
                    plotHeight +
                    22
                  }
                  textAnchor="middle"
                  fontSize="10"
                  fill="#92979D"
                >
                  {formatNumber(
                    tick,
                  )}
                </text>
              </g>
            );
          },
        )}

        {yTicks.map(
          (
            tick,
          ) => {
            const y =
              yFor(
                tick,
              );

            return (
              <g
                key={
                  `y-${tick}`
                }
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
                />

                <text
                  x={
                    left -
                    12
                  }
                  y={
                    y +
                    4
                  }
                  textAnchor="end"
                  fontSize="10"
                  fill="#92979D"
                >
                  {formatNumber(
                    tick,
                    tick < 1
                      ? 1
                      : 0,
                  )}
                </text>
              </g>
            );
          },
        )}

        <line
          x1={
            dividerX
          }
          x2={
            dividerX
          }
          y1={
            top
          }
          y2={
            top +
            plotHeight
          }
          stroke="var(--text-secondary)"
          strokeWidth="2"
        />

        <line
          x1={
            left
          }
          x2={
            width -
            right
          }
          y1={
            dividerY
          }
          y2={
            dividerY
          }
          stroke="var(--text-secondary)"
          strokeWidth="2"
        />

        <text
          x={
            left +
            14
          }
          y={
            top +
            22
          }
          fontSize="12"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          Crítico
        </text>

        <text
          x={
            width -
            right -
            14
          }
          y={
            top +
            22
          }
          textAnchor="end"
          fontSize="12"
          fontWeight="600"
          fill="#B72831"
        >
          Crítico-crônico
        </text>

        <text
          x={
            left +
            14
          }
          y={
            top +
            plotHeight -
            14
          }
          fontSize="12"
          fontWeight="600"
          fill="#6D747A"
        >
          Conforto
        </text>

        <text
          x={
            width -
            right -
            14
          }
          y={
            top +
            plotHeight -
            14
          }
          textAnchor="end"
          fontSize="12"
          fontWeight="600"
          fill="#6D747A"
        >
          Crônico
        </text>

        {items.map(
          (
            item,
            index,
=======
        <ChartTooltip
          tooltip={
            tooltip
          }
        />

=======
        <ChartTooltip
          tooltip={
            tooltip
          }
        />

>>>>>>> origin/marques
=======
        <ChartTooltip
          tooltip={
            tooltip
          }
        />

>>>>>>> origin/marques
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Jack-Knife de frequência por MTTR"
          onMouseMove={(
            event,
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
          ) => {
            if (
              !tooltip
            ) {
              return;
            }

            const rect =
              event
                .currentTarget
                .getBoundingClientRect();

            setTooltip(
              (
                current,
              ) =>
                current
                  ? {
                      ...current,

                      x:
                        event.clientX -
                        rect.left,

                      y:
                        event.clientY -
                        rect.top,
                    }
                  : null,
            );
          }}
        >
          <g
            key={`quadrants-${animationKey}`}
          >
            <rect
              x={
                left
              }
              y={
                top
              }
              width={
                Math.max(
                  0,
                  dividerX -
                    left,
                )
              }
              height={
                Math.max(
                  0,
                  dividerY -
                    top,
                )
              }
              fill="#FCF8F8"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.42s"
                fill="freeze"
              />
            </rect>

            <rect
              x={
                dividerX
              }
              y={
                top
              }
              width={
                Math.max(
                  0,
                  width -
                    right -
                    dividerX,
                )
              }
              height={
                Math.max(
                  0,
                  dividerY -
                    top,
                )
              }
              fill="#FFF5F5"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.48s"
                fill="freeze"
              />
            </rect>

            <rect
              x={
                left
              }
              y={
                dividerY
              }
              width={
                Math.max(
                  0,
                  dividerX -
                    left,
                )
              }
              height={
                Math.max(
                  0,
                  top +
                    plotHeight -
                    dividerY,
                )
              }
              fill="#FFFFFF"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.42s"
                fill="freeze"
              />
            </rect>

            <rect
              x={
                dividerX
              }
              y={
                dividerY
              }
              width={
                Math.max(
                  0,
                  width -
                    right -
                    dividerX,
                )
              }
              height={
                Math.max(
                  0,
                  top +
                    plotHeight -
                    dividerY,
                )
              }
              fill="#F8F8F7"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                dur="0.48s"
                fill="freeze"
              />
            </rect>
          </g>

          {xTicks.map(
            (
              tick,
            ) => {
              const x =
                xFor(
                  tick,
                );

              return (
                <g
                  key={`x-${tick}`}
                >
                  <line
                    x1={
                      x
                    }
                    x2={
                      x
                    }
                    y1={
                      top
                    }
                    y2={
                      top +
                      plotHeight
                    }
                    stroke="#E9EBEC"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      x
                    }
                    y={
                      top +
                      plotHeight +
                      27
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fill="#92979D"
                  >
                    {formatNumber(
                      tick,
                    )}
                  </text>
                </g>
              );
            },
          )}

          {yTicks.map(
            (
              tick,
            ) => {
              const y =
                yFor(
                  tick,
                );

              return (
                <g
                  key={`y-${tick}`}
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
                    stroke="#E9EBEC"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      left -
                      14
                    }
                    y={
                      y +
                      4
                    }
                    textAnchor="end"
                    fontSize="10"
                    fill="#92979D"
                  >
                    {formatNumber(
                      tick,
                      tick <
                        1
                        ? 1
                        : 0,
                    )}
                  </text>
                </g>
              );
            },
          )}

          <line
            x1={
              dividerX
            }
            x2={
              dividerX
            }
            y1={
              top
            }
            y2={
              top +
              plotHeight
            }
            stroke="#202327"
            strokeWidth="1.5"
            strokeDasharray="7 7"
            opacity="0.62"
          />

          <line
            x1={
              left
            }
            x2={
              width -
              right
            }
            y1={
              dividerY
            }
            y2={
              dividerY
            }
            stroke="#202327"
            strokeWidth="1.5"
            strokeDasharray="7 7"
            opacity="0.62"
          />

          <g
            pointerEvents="none"
          >
            <text
              x={
                left +
                22
              }
              y={
                top +
                32
              }
              fontSize="11"
              fontWeight="700"
              fill="#7E3D43"
              letterSpacing="1.2"
            >
              CRÍTICO
            </text>

            <text
              x={
                left +
                22
              }
              y={
                top +
                51
              }
              fontSize="9"
              fill="#A28E90"
            >
              Alto MTTR
            </text>

            <text
              x={
                dividerX +
                22
              }
              y={
                top +
                32
              }
              fontSize="11"
              fontWeight="800"
              fill="#C91D28"
              letterSpacing="1.2"
            >
              CRÍTICO-CRÔNICO
            </text>

            <text
              x={
                dividerX +
                22
              }
              y={
                top +
                51
              }
              fontSize="9"
              fill="#B88D91"
            >
              Alta frequência · alto MTTR
            </text>

            <text
              x={
                left +
                22
              }
              y={
                dividerY +
                32
              }
              fontSize="11"
              fontWeight="700"
              fill="#7F858B"
              letterSpacing="1.2"
            >
              CONFORTO
            </text>

            <text
              x={
                left +
                22
              }
              y={
                dividerY +
                51
              }
              fontSize="9"
              fill="#A0A5AA"
            >
              Abaixo dos limites
            </text>

            <text
              x={
                dividerX +
                22
              }
              y={
                dividerY +
                32
              }
              fontSize="11"
              fontWeight="700"
              fill="#4E5358"
              letterSpacing="1.2"
            >
              CRÔNICO
            </text>

            <text
              x={
                dividerX +
                22
              }
              y={
                dividerY +
                51
              }
              fontSize="9"
              fill="#8F9499"
            >
              Alta frequência
            </text>
          </g>

          {items.map(
            (
              item,
              index,
            ) => {
              const x =
                xForItem(
                  item,
                  index,
                );

              const y =
                yFor(
                  item.mttr,
                );

              const active =
                hoveredIndex ===
                  index;

              const pointColor =
                quadrantColor(
                  item.quadrant,
                );

              const radius =
                radiusFor(
                  item.downtimeMinutes,
                );

              const open =
                () =>
                  onSelect(
                    item,
                    index,
                  );

              const begin =
                `${Math.min(
                  index *
                    0.008,
                  0.28,
                )}s`;

              return (
                <g
                  key={`${animationKey}-${item.label}-${index}`}
                  className="cursor-pointer outline-none"
                  role="button"
                  tabIndex={0}
                  onClick={
                    open
                  }
                  onKeyDown={(
                    event,
                  ) =>
                    activateWithKeyboard(
                      event,
                      open,
                    )
                  }
                  onMouseEnter={() => {
                    setHoveredIndex(
                      index,
                    );

                    setTooltip({
                      x,
                      y,

                      title:
                        item.label,

                      lines: [
                        quadrantLabel(
                          item.quadrant,
                        ),

                        `Falhas: ${formatNumber(
                          item.frequency,
                          1,
                        )}`,

                        `MTTR: ${formatNumber(
                          item.mttr,
                          1,
                        )} min`,

                        `Parada total: ${formatNumber(
                          item.downtimeMinutes,
                          1,
                        )} min`,
                      ],
                    });
                  }}
                  onFocus={() => {
                    setHoveredIndex(
                      index,
                    );

                    setTooltip({
                      x,
                      y,

                      title:
                        item.label,

                      lines: [
                        quadrantLabel(
                          item.quadrant,
                        ),

                        `Falhas: ${formatNumber(
                          item.frequency,
                          1,
                        )}`,

                        `MTTR: ${formatNumber(
                          item.mttr,
                          1,
                        )} min`,

                        `Parada total: ${formatNumber(
                          item.downtimeMinutes,
                          1,
                        )} min`,
                      ],
                    });
                  }}
                  onBlur={() => {
                    setHoveredIndex(
                      null,
                    );

                    setTooltip(
                      null,
                    );
                  }}
                >
                  <circle
                    cx={
                      x
                    }
                    cy={
                      y
                    }
                    r={
                      Math.max(
                        18,
                        radius +
                          8,
                      )
                    }
                    fill="transparent"
                  />

                  {active && (
                    <circle
                      cx={
                        x
                      }
                      cy={
                        y
                      }
                      r={
                        radius +
                        5
                      }
                      fill="none"
                      stroke={
                        pointColor
                      }
                      strokeWidth="1.5"
                      opacity="0.22"
                    />
                  )}

                  <circle
                    cx={
                      x
                    }
                    cy={
                      y
                    }
                    r={
                      radius
                    }
                    fill={
                      pointColor
                    }
                    fillOpacity={
                      active
                        ? 1
                        : 0.82
                    }
                    stroke="#FFFFFF"
                    strokeWidth={
                      active
                        ? 3
                        : 1.8
                    }
                  >
                    <animate
                      attributeName="r"
                      from="0"
                      to={
                        radius
                      }
                      dur="0.45s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />

                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur="0.38s"
                      begin={
                        begin
                      }
                      fill="freeze"
                    />
                  </circle>

                  {active && (
                    <g
                      pointerEvents="none"
                    >
                      <rect
                        x={
                          Math.min(
                            width -
                              right -
                              226,
                            x +
                              radius +
                              10,
                          )
                        }
                        y={
                          Math.max(
                            top +
                              8,
                            y -
                              19,
                          )
                        }
                        width="216"
                        height="38"
                        rx="11"
                        fill="#FFFFFF"
                        stroke="#E5E7E9"
                      />

                      <text
                        x={
                          Math.min(
                            width -
                              right -
                              214,
                            x +
                              radius +
                              22,
                          )
                        }
                        y={
                          Math.max(
                            top +
                              31,
                            y +
                              4,
                          )
                        }
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#303438"
                      >
                        {truncate(
                          item.label,
                          29,
                        )}
                      </text>
                    </g>
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
              left
            }
            y1={
              top
            }
            y2={
              top +
              plotHeight
            }
            stroke="#B9BDC2"
          />

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
            stroke="#B9BDC2"
          />

          <text
            x={
              left
            }
            y="25"
            fontSize="10"
            fontWeight="700"
            fill="#666C72"
          >
            MTTR (min)
          </text>

          <text
            x={
              width -
              right
            }
            y={
              height -
              23
            }
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill="#666C72"
          >
            Nº de falhas
          </text>

          <g
            pointerEvents="none"
          >
            <rect
              x={
                dividerX -
                29
              }
              y={
                top +
                plotHeight +
                34
              }
              width="58"
              height="22"
              rx="11"
              fill="#FFFFFF"
              stroke="#E4E6E8"
            />

            <text
              x={
                dividerX
              }
              y={
                top +
                plotHeight +
                49
              }
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#555B61"
            >
              {formatNumber(
                safeFrequencyLimit,
                1,
              )}
            </text>

            <rect
              x={
                left -
                69
              }
              y={
                dividerY -
                11
              }
              width="56"
              height="22"
              rx="11"
              fill="#FFFFFF"
              stroke="#E4E6E8"
            />

            <text
              x={
                left -
                41
              }
              y={
                dividerY +
                4
              }
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#555B61"
            >
              {formatNumber(
                safeMttrLimit,
                1,
              )}
            </text>
          </g>
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-2 px-1 text-[9px] text-[#969BA1] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Escalas logarítmicas preservam a leitura entre valores de ordens diferentes. Pontos com a mesma frequência recebem apenas um microdeslocamento visual para evitar sobreposição.
        </p>

        <p className="font-medium text-[#666C72]">
          Limites:{" "}
          {formatNumber(
            safeFrequencyLimit,
            1,
          )}{" "}
          falhas ·{" "}
          {formatNumber(
            safeMttrLimit,
            1,
          )}{" "}
          min MTTR
        </p>
      </div>
    </div>
  );
}

export function ReliabilityPage({
  user,
  unit,
  canWrite,
}: ReliabilityPageProps) {
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
      ReliabilityData | null
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

  const [
    selectedPoint,
    setSelectedPoint,
  ] =
    useState<
      SelectedChartPoint | null
    >(null);

  const [
    reportOpen,
    setReportOpen,
  ] =
    useState(
      false,
    );

  const [
    maspSelection,
    setMaspSelection,
  ] =
    useState<
      ReliabilityMaspSelection | null
    >(null);

  const [
    equipmentHistorySelection,
    setEquipmentHistorySelection,
  ] =
    useState<{
      equipmentName: string;
      lineName: string | null;
    } | null>(
      null,
    );

  const [
    analysisFullscreen,
    setAnalysisFullscreen,
  ] =
    useState(
      false,
    );

  const [
    analysisLayout,
    setAnalysisLayout,
  ] =
    useState<AnalysisLayout>(
      "SIDE_BY_SIDE",
    );

  const [
    analysisOrder,
    setAnalysisOrder,
  ] =
    useState<AnalysisOrder>(
      "PARETO_FIRST",
    );

  const [
    analysisFocus,
    setAnalysisFocus,
  ] =
    useState<AnalysisFocus>(
      "BOTH",
    );

  const closeDetail =
    useCallback(
      () => {
        setSelectedPoint(
          null,
        );
      },
      [],
    );

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

        setSelectedPoint(
          null,
        );

        try {
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

          const response =
            await fetch(
              `/api/analytics/reliability?${params.toString()}`,
              {
                cache:
                  "no-store",

                signal,
              },
            );

          const raw =
            await response
              .json();

          if (
            !response.ok ||
            !raw?.success
          ) {
            throw new Error(
              raw?.message ??
                "Não foi possível carregar os dados.",
            );
          }

          const normalized =
            normalizeReliabilityData(
              raw,
            );

          setData(
            normalized,
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
              : "Não foi possível carregar os dados.",
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
        startDate,
        endDate,
        line,
        equipment,
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

  const handleUnitSelectionApplied =
    useCallback(
      async () => {
        setSelectedPoint(
          null,
        );

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
        clearAssetFilters,
        loadData,
        line,
        equipment,
      ],
    );

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
            unit.city ??
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
        unit.city,
      ],
    );

  const handleResetFilters =
    useCallback(
      () => {
        setSelectedPoint(
          null,
        );

        resetFilters();
      },
      [
        resetFilters,
      ],
    );

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

  return (
    <main className="min-h-screen bg-surface-elevated">
      <header className="border-b border-border-theme/[0.05] bg-surface">
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
                unit.city
              }
              onSelectionApplied={
                handleUnitSelectionApplied
              }
            />

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium text-text-primary">
                {user.name}
              </p>

              <p className="mt-0.5 text-[10px] text-text-secondary">
                Análise de confiabilidade
              </p>
            </div>

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <ThemeSwitcher />
          </div>
        </div>
      </header>

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

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
              Confiabilidade
            </h1>

            <div className="mt-4 inline-flex items-center rounded-full bg-surface-elevated px-3 py-1.5">
              <span className="text-[10px] font-medium text-text-secondary">
                {selectedUnitsLabel}
              </span>
            </div>
=======
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A2A6AB]">
              Engenharia de confiabilidade
            </p>

            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Confiabilidade
            </h1>

            <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-[#8D9298]">
              Análise de falhas e desempenho dos ativos.
            </p>
>>>>>>> origin/marques
=======
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A2A6AB]">
              Engenharia de confiabilidade
            </p>

            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Confiabilidade
            </h1>

            <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-[#8D9298]">
              Análise de falhas e desempenho dos ativos.
            </p>
>>>>>>> origin/marques
=======
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A2A6AB]">
              Engenharia de confiabilidade
            </p>

            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Confiabilidade
            </h1>

            <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-[#8D9298]">
              Análise de falhas e desempenho dos ativos.
            </p>
>>>>>>> origin/marques
          </div>

          <button
            type="button"
            onClick={() =>
              setReportOpen(
                true,
              )
            }
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] bg-[#E41E2B] px-5 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(228,30,43,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#CF1824] hover:shadow-[0_12px_28px_rgba(228,30,43,0.20)] active:translate-y-0 sm:self-auto"
          >
            <FileDown
              size={15}
            />

            Gerar relatório
          </button>
        </div>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        <section className="mt-8 grid gap-4 border-y border-border-theme py-5 md:grid-cols-2 xl:grid-cols-[180px_180px_1fr_1fr_auto]">
          <label className="block">
            <span className="text-[10px] font-medium text-text-secondary">
              De
            </span>

            <input
              type="date"
              value={
                startDate
              }
              max={
                endDate ||
                undefined
              }
              onChange={(
                event,
              ) =>
                setStartDate(
                  event
                    .target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-border-theme"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-medium text-text-secondary">
              Até
            </span>

            <input
              type="date"
              value={
                endDate
              }
              min={
                startDate ||
                undefined
              }
              onChange={(
                event,
              ) =>
                setEndDate(
                  event
                    .target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-border-theme"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-medium text-text-secondary">
              Linha
            </span>

            <select
              value={
                line
              }
              onChange={(
                event,
              ) => {
                setLine(
                  event
                    .target
                    .value,
                );

                setEquipment(
                  "",
                );
              }}
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-border-theme"
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
        <nav
          aria-label="Navegação da confiabilidade"
          className="mt-6 overflow-x-auto border-b border-black/[0.055]"
        >
          <div className="flex min-w-max items-center gap-7">
            <Link
              href="/dashboard/confiabilidade"
              aria-current="page"
              className="relative pb-3 text-[11px] font-semibold text-[#202327]"
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
            >
              Visão geral

              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#E41E2B]" />
            </Link>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          <label className="block">
            <span className="text-[10px] font-medium text-text-secondary">
              Equipamento
            </span>

            <select
              value={
                equipment
              }
              onChange={(
                event,
              ) =>
                setEquipment(
                  event
                    .target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-border-theme"
=======
            <Link
              href="/dashboard/confiabilidade/origens"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
=======
            <Link
              href="/dashboard/confiabilidade/origens"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
=======
            <Link
              href="/dashboard/confiabilidade/origens"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
            >
              Origens
            </Link>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
              {equipments.map(
                (
                  option,
                ) => (
                  <option
                    key={
                      option
                    }
                    value={
                      option
                    }
                  >
                    {option}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={
                resetFilters
              }
              className="flex h-11 items-center gap-2 px-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-[#E41E2B]"
=======
            <Link
              href="/dashboard/confiabilidade/evolucao"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
=======
            <Link
              href="/dashboard/confiabilidade/evolucao"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
=======
            <Link
              href="/dashboard/confiabilidade/evolucao"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
>>>>>>> origin/marques
            >
              Evolução
            </Link>

            <Link
              href="/dashboard/confiabilidade/falhas"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
            >
              Falhas recorrentes
            </Link>

            <Link
              href="/dashboard/confiabilidade/linhas"
              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"
            >
              Linhas
            </Link>
          </div>
        </nav>

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
              handleResetFilters
            }
          />
        )}

        {error && (
          <div className="mt-8 rounded-[14px] border border-[#F0D2D5] bg-surface-elevated px-4 py-3 text-[12px] text-[#BF2C35]">
            {error}
          </div>
        )}

        {loading &&
          !data && (
            <div className="flex min-h-[420px] items-center justify-center">
              <LoaderCircle
                size={22}
                className="animate-spin text-[#E41E2B]"
              />
            </div>
          )}

        {data && (
          <>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-text-secondary">
                {formatNumber(
                  data
                    .summary
                    .events,
                )}{" "}
                ocorrências
                {" · "}
                {formatNumber(
                  data
                    .summary
                    .downtimeMinutes,
                  1,
                )}{" "}
                min de parada
              </p>

              {loading && (
                <LoaderCircle
                  size={
                    16
                  }
                  className="animate-spin text-[#E41E2B]"
                />
              )}
            </div>

            <section className="mt-5 overflow-hidden rounded-[24px] border border-border-theme bg-surface">
              <div className="flex flex-col gap-3 border-b border-border-theme px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#E41E2B] px-2 text-[10px] font-bold text-white">
=======
            <section
              id="reliability-pareto"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#E41E2B]/[0.04] blur-3xl" />

              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
>>>>>>> origin/marques
=======
            <section
              id="reliability-pareto"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#E41E2B]/[0.04] blur-3xl" />

              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
>>>>>>> origin/marques
=======
            <section
              id="reliability-pareto"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#E41E2B]/[0.04] blur-3xl" />

              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
>>>>>>> origin/marques
                    01

                    <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
                  </div>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                  <div>
                    <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                      Origem das falhas
                    </h2>

                    <p className="mt-1 text-[11px] text-text-secondary">
                      Operação × manutenção no recorte selecionado
                    </p>
                  </div>
                </div>

                <p className="text-[10px] font-medium text-text-secondary">
                  {formatNumber(
                    data
                      .failureOrigin
                      .classified,
                  )}{" "}
                  ocorrências classificadas
                </p>
              </div>
=======
                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Pareto
                  </h2>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <div className="flex items-center gap-4 text-[9px] font-medium text-[#858A90]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#E41E2B]" />
>>>>>>> origin/marques

                      Faixa vital
                    </span>

<<<<<<< HEAD
            <section className="mt-6 overflow-hidden rounded-[24px] border border-border-theme bg-surface">
              <div className="flex items-center justify-between gap-6 border-b border-border-theme px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#25282C] px-2 text-[10px] font-bold text-white">
                    02
                  </div>

                  <div>
                    <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                      Pareto de tempo de parada
                    </h2>

                    <p className="mt-1 text-[11px] text-text-secondary">
                      Tempo de parada + percentual acumulado · por{" "}
                      {analysisLabel}
                    </p>
                  </div>
                </div>

                <p className="hidden text-[10px] text-text-secondary sm:block">
                  Clique em uma barra ou ponto para detalhar
                </p>
=======
                    <span className="flex items-center gap-1.5">
                      <span className="h-[2px] w-5 rounded-full bg-[#202327]" />

                      Acumulado
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisFocus(
                        "PARETO",
                      );

                      setAnalysisFullscreen(
                        true,
                      );
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-black/[0.06] bg-[#FAFAF9] px-3 text-[9px] font-semibold text-[#656A70] transition hover:bg-[#F1F1F0] hover:text-[#202327]"
                  >
                    <Maximize2
                      size={12}
                    />

                    Expandir
                  </button>
                </div>
>>>>>>> origin/marques
=======
                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Pareto
                  </h2>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <div className="flex items-center gap-4 text-[9px] font-medium text-[#858A90]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#E41E2B]" />

                      Faixa vital
                    </span>

                    <span className="flex items-center gap-1.5">
                      <span className="h-[2px] w-5 rounded-full bg-[#202327]" />

                      Acumulado
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisFocus(
                        "PARETO",
                      );

                      setAnalysisFullscreen(
                        true,
                      );
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-black/[0.06] bg-[#FAFAF9] px-3 text-[9px] font-semibold text-[#656A70] transition hover:bg-[#F1F1F0] hover:text-[#202327]"
                  >
                    <Maximize2
                      size={12}
                    />

                    Expandir
                  </button>
                </div>
>>>>>>> origin/marques
=======
                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Pareto
                  </h2>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <div className="flex items-center gap-4 text-[9px] font-medium text-[#858A90]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#E41E2B]" />

                      Faixa vital
                    </span>

                    <span className="flex items-center gap-1.5">
                      <span className="h-[2px] w-5 rounded-full bg-[#202327]" />

                      Acumulado
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisFocus(
                        "PARETO",
                      );

                      setAnalysisFullscreen(
                        true,
                      );
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-black/[0.06] bg-[#FAFAF9] px-3 text-[9px] font-semibold text-[#656A70] transition hover:bg-[#F1F1F0] hover:text-[#202327]"
                  >
                    <Maximize2
                      size={12}
                    />

                    Expandir
                  </button>
                </div>
>>>>>>> origin/marques
              </div>

              <div className="relative p-4 sm:p-5 sm:px-6 sm:pb-6">
                <ParetoChart
                  items={
                    data.pareto
                  }
                  onSelect={(
                    item,
                    index,
                  ) => {
                    setSelectedPoint({
                      type:
                        "PARETO",

                      item,

                      index,
                    });
                  }}
                />
              </div>
            </section>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            <section className="mt-6 overflow-hidden rounded-[24px] border border-border-theme bg-surface">
              <div className="flex items-center justify-between gap-6 border-b border-border-theme px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#25282C] px-2 text-[10px] font-bold text-white">
                    03
                  </div>

                  <div>
                    <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                      Jack-Knife
                    </h2>

                    <p className="mt-1 text-[11px] text-text-secondary">
                      Nº de falhas × MTTR · por{" "}
                      {analysisLabel}
                    </p>
                  </div>
                </div>

                <p className="hidden text-[10px] text-text-secondary sm:block">
                  Clique em um ponto para detalhar
                </p>
=======
            <section
              id="reliability-jackknife"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
                    02

                    <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
                  </div>

                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Jack-Knife
                  </h2>
                </div>

=======
            <section
              id="reliability-jackknife"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
                    02

                    <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
                  </div>

                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Jack-Knife
                  </h2>
                </div>

>>>>>>> origin/marques
=======
            <section
              id="reliability-jackknife"
              className="scroll-mt-[110px] relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_14px_44px_rgba(28,31,34,0.035)]"
            >
              <div className="flex flex-col gap-3 border-b border-black/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-[#202327] px-2 text-[9px] font-bold text-white shadow-[0_4px_12px_rgba(32,35,39,0.10)]">
                    02

                    <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
                  </div>

                  <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
                    Jack-Knife
                  </h2>
                </div>

>>>>>>> origin/marques
                <button
                  type="button"
                  onClick={() => {
                    setAnalysisFocus(
                      "JACK_KNIFE",
                    );

                    setAnalysisFullscreen(
                      true,
                    );
                  }}
                  className="inline-flex h-8 shrink-0 items-center gap-2 self-start rounded-[10px] border border-black/[0.06] bg-[#FAFAF9] px-3 text-[9px] font-semibold text-[#656A70] transition hover:bg-[#F1F1F0] hover:text-[#202327] sm:self-auto"
                >
                  <Maximize2
                    size={12}
                  />

                  Expandir
                </button>
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
              </div>

              <div className="relative p-4 sm:p-5 sm:px-6 sm:pb-6">
                <JackKnifeChart
                  items={
                    data
                      .jackKnife
                  }
                  frequencyLimit={
                    data
                      .jackKnifeLimits
                      .frequency
                  }
                  mttrLimit={
                    data
                      .jackKnifeLimits
                      .mttr
                  }
                  onSelect={(
                    item,
                    index,
                  ) => {
                    setSelectedPoint({
                      type:
                        "JACK_KNIFE",

                      item,

                      index,
                    });
                  }}
                />
              </div>
            </section>
          </>
        )}

        {/* =============================================
            GRÁFICOS COMPLEMENTARES

            Compartilham os filtros acima e carregam os
            próprios dados, para não atrasar o Pareto e o
            Jack-Knife.
        ============================================== */}

        <ComplementaryCharts
          unitSelectionKey={(data?.filters.selectedUnitIds ?? []).join(",")}
          city={unit.city}
          startDate={startDate}
          endDate={endDate}
          line={line}
          equipment={equipment}
          onLineChange={setLine}
        />
      </div>

      {data && (
        <AnalysisFullscreen
          open={
            analysisFullscreen
          }
          layout={
            analysisLayout
          }
          order={
            analysisOrder
          }
          focus={
            analysisFocus
          }
          onLayoutChange={
            setAnalysisLayout
          }
          onOrderChange={
            setAnalysisOrder
          }
          onFocusChange={
            setAnalysisFocus
          }
          onClose={() =>
            setAnalysisFullscreen(
              false,
            )
          }
          pareto={
            <ParetoChart
              items={
                data.pareto
              }
              onSelect={(
                item,
                index,
              ) => {
                setSelectedPoint({
                  type:
                    "PARETO",

                  item,

                  index,
                });
              }}
            />
          }
          jackKnife={
            <JackKnifeChart
              items={
                data.jackKnife
              }
              frequencyLimit={
                data
                  .jackKnifeLimits
                  .frequency
              }
              mttrLimit={
                data
                  .jackKnifeLimits
                  .mttr
              }
              onSelect={(
                item,
                index,
              ) => {
                setSelectedPoint({
                  type:
                    "JACK_KNIFE",

                  item,

                  index,
                });
              }}
            />
          }
        />
      )}

      <ReportGeneratorModal
        open={
          reportOpen
        }
        onClose={() =>
          setReportOpen(
            false,
          )
        }
        initialStartDate={
          startDate
        }
        initialEndDate={
          endDate
        }
        initialUnitIds={
          data
            ?.filters
            .selectedUnitIds ??
          []
        }
      />

      <ReliabilityDetailDrawer
        selected={
          selectedPoint
        }
        analysisLevel={
          data
            ?.analysisLevel ??
          "EQUIPMENT"
        }
        equipment={
          equipment
        }
        frequencyLimit={
          data
            ?.jackKnifeLimits
            .frequency ??
          1
        }
        mttrLimit={
          data
            ?.jackKnifeLimits
            .mttr ??
          0
        }
        onClose={
          closeDetail
        }
        onDrillDownEquipment={(
          equipmentName,
        ) => {
          setSelectedPoint(
            null,
          );

          setEquipment(
            equipmentName,
          );
        }}
        onBackToEquipments={() => {
          setSelectedPoint(
            null,
          );

          setEquipment(
            "",
          );
        }}
        onStartMasp={canWrite ? () => {
          if (
            !selectedPoint ||
            !data
          ) {
            return;
          }

          const groupLabel =
            selectedPoint
              .item
              .label;

          const occurrences =
            selectedPoint.type ===
              "PARETO"
              ? selectedPoint
                  .item
                  .occurrences
              : selectedPoint
                  .item
                  .frequency;

          const equipmentLabel =
            data.analysisLevel ===
              "FAILURE_MODE"
              ? equipment
              : groupLabel ===
                "Equipamento não informado"
                ? ""
                : groupLabel;

          setMaspSelection({
            analysisLevel:
              data.analysisLevel,

            groupLabel,

            occurrences,

            startDate,

            endDate,

            line,

            equipmentFilter:
              equipment,

            equipmentLabel,
          });
<<<<<<< HEAD
        } : undefined}
=======
        }}
        onOpenEquipmentHistory={(
          equipmentName,
        ) => {
          setSelectedPoint(
            null,
          );

          setEquipmentHistorySelection({
            equipmentName,

            lineName:
              line ||
              null,
          });
        }}
      />

      <EquipmentHistory
        open={
          Boolean(
            equipmentHistorySelection,
          )
        }
        equipment={
          equipmentHistorySelection
            ?.equipmentName ??
          ""
        }
        startDate={
          startDate
        }
        endDate={
          endDate
        }
        line={
          equipmentHistorySelection
            ?.lineName ??
          null
        }
        onClose={() =>
          setEquipmentHistorySelection(
            null,
          )
        }
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
      />

      {maspSelection && (
        <ReliabilityMaspDialog
          selection={
            maspSelection
          }
          onClose={() =>
            setMaspSelection(
              null,
            )
          }
        />
      )}
    </main>
  );
}
