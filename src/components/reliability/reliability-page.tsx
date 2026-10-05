"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  FileDown,
  LoaderCircle,
  RotateCcw,
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

import {
  FailureOriginAnalysis,
  type FailureOriginSummary,
} from "@/components/reliability/failure-origin-analysis";

import {
  ComplementaryCharts,
} from "@/components/charts/complementary-charts";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";

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

  failureOrigin:
    FailureOriginSummary;

  pareto: ParetoItem[];

  jackKnife:
    JackKnifeItem[];

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

  onClose:
    () => void;

  onDrillDownEquipment:
    (
      equipmentName: string,
    ) => void;

  onBackToEquipments:
    () => void;

  /* Ausente para quem só consulta (Gestor). */
  onStartMasp?:
    () => void;
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
  unit:
    ReliabilityUnit,
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

function dateToInput(
  date: Date,
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const end =
    new Date();

  const start =
    new Date();

  start.setDate(
    start.getDate() -
      29,
  );

  return {
    start:
      dateToInput(
        start,
      ),

    end:
      dateToInput(
        end,
      ),
  };
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
  frequencyLimit:
    number,
  mttrLimit:
    number,
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
  quadrant:
    Quadrant,
) {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return "#E41E2B";

    case "CRITICA":
      return "#E3A52F";

    case "CRONICA":
      return "#4E9ED7";

    case "BAIXA_RELEVANCIA":

    default:
      return "#62A96B";
  }
}

function quadrantLabel(
  quadrant:
    Quadrant,
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
  quadrant:
    Quadrant,
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
  action:
    () => void,
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
      className="pointer-events-none absolute z-20 min-w-[180px] rounded-[12px] bg-[#202225] px-3.5 py-3 text-white shadow-xl"
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
              key={
                line
              }
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
}: ReliabilityDetailDrawerProps) {
  useEffect(() => {
    if (!selected) {
      return;
    }

    function handleKeyDown(
      event:
        KeyboardEvent,
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
              `#${
                selected.index +
                1
              }`
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
                  `${
                    Math.min(
                      100,
                      item
                        .cumulativePercentage,
                    )
                  }%`,
              }}
            />

            <div className="absolute bottom-0 left-[80%] top-0 w-px bg-[#C79B21]" />
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
                `${
                  quadrantColor(
                    item.quadrant,
                  )
                }12`,
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
      className="fixed inset-0 z-50"
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
  items:
    ParetoItem[];

  onSelect:
    (
      item:
        ParetoItem,
      index:
        number,
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
    page,
    setPage,
  ] =
    useState(
      0,
    );

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
      totalPages -
        1,
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
          setPage(
            0,
          );

          setTooltip(
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
    items.length ===
    0
  ) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-[13px] text-text-secondary">
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
          `${
            index === 0
              ? "M"
              : "L"
          } ${point.x} ${point.y}`,
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
  }

  return (
    <div
      className="relative overflow-hidden"
      onMouseLeave={() =>
        setTooltip(
          null,
        )
      }
    >
      <ChartTooltip
        tooltip={
          tooltip
        }
      />

      <svg
        viewBox={
          `0 0 ${width} ${height}`
        }
        className="h-auto w-full"
        role="img"
        aria-label={
          `Pareto do tempo de parada. Exibindo itens ${
            startIndex + 1
          } a ${endIndex} de ${items.length}.`
        }
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
                  stroke="var(--chart-grid)"
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
                  fontSize="11"
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

        {percentageTicks.map(
          (
            percentage,
          ) => {
            const y =
              yForPercentage(
                percentage,
              );

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
                fontSize="11"
                fill={
                  percentage ===
                  80
                    ? "#A68424"
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
          stroke="#C79B21"
          strokeWidth="2"
          strokeDasharray="9 7"
        />

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

            const open =
              () =>
                onSelect(
                  item,
                  globalIndex,
                );

            return (
              <g
                key={
                  `${item.label}-${globalIndex}`
                }
                className="cursor-pointer"
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
                onMouseEnter={() =>
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
                  r="13"
                  fill="transparent"
                />

                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
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
          stroke="#AEB2B7"
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
          stroke="#AEB2B7"
        />

        <text
          x={
            left
          }
          y="24"
          fontSize="11"
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
          fontSize="11"
          fill="#777C82"
        >
          Percentual acumulado
        </text>
      </svg>

      <div className="mt-2 flex flex-col gap-3 border-t border-border-theme px-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium text-text-primary">
            Exibindo{" "}
            {startIndex + 1}
            –
            {endIndex} de{" "}
            {items.length} categorias
          </p>

          <p className="mt-0.5 text-[10px] text-text-secondary">
            Ordenação global por tempo de parada · acumulado preservado entre páginas
          </p>
        </div>

        {totalPages >
          1 && (
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

              Anterior
            </button>

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

              <ChevronRight
                size={14}
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
  items:
    JackKnifeItem[];

  frequencyLimit:
    number;

  mttrLimit:
    number;

  onSelect:
    (
      item:
        JackKnifeItem,
      index:
        number,
    ) => void;
}) {
  const [
    tooltip,
    setTooltip,
  ] =
    useState<
      TooltipState | null
    >(null);

  if (
    items.length ===
    0
  ) {
    return (
      <div className="flex min-h-[430px] items-center justify-center text-[13px] text-text-secondary">
        Nenhuma ocorrência foi encontrada para o recorte selecionado.
      </div>
    );
  }

  const width =
    1100;

  const height =
    500;

  const left =
    86;

  const right =
    44;

  const top =
    46;

  const bottom =
    78;

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
    frequency:
      number,
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
    mttr:
      number,
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
    let tick = 1;
    tick <= maxX;
    tick *= 10
  ) {
    xTicks.push(
      tick,
    );
  }

  const yTicks:
    number[] =
    [];

  for (
    let exponent = -1;
    10 ** exponent <=
      maxY;
    exponent += 1
  ) {
    yTicks.push(
      10 **
        exponent,
    );
  }

  return (
    <div
      className="relative overflow-hidden"
      onMouseLeave={() =>
        setTooltip(
          null,
        )
      }
    >
      <ChartTooltip
        tooltip={
          tooltip
        }
      />

      <svg
        viewBox={
          `0 0 ${width} ${height}`
        }
        className="h-auto w-full"
        role="img"
        aria-label="Jack-Knife de frequência por MTTR"
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
          ) => {
            const x =
              xFor(
                item.frequency,
              );

            const y =
              yFor(
                item.mttr,
              );

            const open =
              () =>
                onSelect(
                  item,
                  index,
                );

            return (
              <g
                key={
                  `${item.label}-${index}`
                }
                className="group cursor-pointer"
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
                onMouseEnter={() =>
                  setTooltip({
                    x,
                    y,

                    title:
                      item.label,

                    lines: [
                      `Falhas: ${formatNumber(
                        item.frequency,
                        1,
                      )}`,

                      `MTTR: ${formatNumber(
                        item.mttr,
                        1,
                      )} min`,

                      `Tempo total: ${formatNumber(
                        item
                          .downtimeMinutes,
                        1,
                      )} min`,
                    ],
                  })
                }
              >
                <circle
                  cx={
                    x
                  }
                  cy={
                    y
                  }
                  r="18"
                  fill="transparent"
                />

                <circle
                  cx={
                    x
                  }
                  cy={
                    y
                  }
                  r="8"
                  fill={
                    quadrantColor(
                      item.quadrant,
                    )
                  }
                  stroke="white"
                  strokeWidth="2"
                  className="pointer-events-none transition-transform group-hover:scale-125"
                  style={{
                    transformOrigin:
                      `${x}px ${y}px`,
                  }}
                />

                {items.length <=
                  18 && (
                  <text
                    x={
                      x +
                      11
                    }
                    y={
                      y -
                      8
                    }
                    fontSize="9"
                    fill="#777C82"
                    className="pointer-events-none"
                  >
                    {index +
                      1}
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
          y="22"
          fontSize="11"
          fill="#777C82"
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
            18
          }
          textAnchor="end"
          fontSize="11"
          fill="#777C82"
        >
          Nº de falhas
        </text>

        <g>
          <rect
            x={
              dividerX -
              20
            }
            y={
              top +
              plotHeight +
              28
            }
            width="40"
            height="19"
            rx="5"
            fill="#FFF4F4"
            stroke="#F0BFC3"
          />

          <text
            x={
              dividerX
            }
            y={
              top +
              plotHeight +
              41
            }
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="#B72831"
          >
            {formatNumber(
              safeFrequencyLimit,
              1,
            )}
          </text>
        </g>

        <g>
          <rect
            x={
              left -
              58
            }
            y={
              dividerY -
              10
            }
            width="48"
            height="19"
            rx="5"
            fill="#FFF4F4"
            stroke="#F0BFC3"
          />

          <text
            x={
              left -
              34
            }
            y={
              dividerY +
              3
            }
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="#B72831"
          >
            {formatNumber(
              safeMttrLimit,
              1,
            )}
          </text>
        </g>
      </svg>
    </div>
  );
}

export function ReliabilityPage({
  user,
  unit,
  canWrite,
}: ReliabilityPageProps) {
  const initialRange =
    useMemo(
      () =>
        defaultDateRange(),
      [],
    );

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      initialRange.start,
    );

  const [
    endDate,
    setEndDate,
  ] =
    useState(
      initialRange.end,
    );

  const [
    line,
    setLine,
  ] =
    useState("");

  const [
    equipment,
    setEquipment,
  ] =
    useState("");

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
        signal?:
          AbortSignal,
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
          setLine(
            "",
          );

          setEquipment(
            "",
          );

          return;
        }

        await loadData();
      },
      [
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

  function resetFilters() {
    const range =
      defaultDateRange();

    setStartDate(
      range.start,
    );

    setEndDate(
      range.end,
    );

    setLine(
      "",
    );

    setEquipment(
      "",
    );

    setSelectedPoint(
      null,
    );
  }

  const analysisLabel =
    data
      ?.analysisLevel ===
    "FAILURE_MODE"
      ? "falha"
      : "equipamento";

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
              width={
                180
              }
              height={
                64
              }
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

      <div className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-10 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft
            size={
              15
            }
          />

          Voltar
        </Link>

        <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
              Confiabilidade
            </h1>

            <div className="mt-4 inline-flex items-center rounded-full bg-surface-elevated px-3 py-1.5">
              <span className="text-[10px] font-medium text-text-secondary">
                {selectedUnitsLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setReportOpen(
                true,
              )
            }
            className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] bg-[#E41E2B] px-5 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(228,30,43,0.15)] transition-colors hover:bg-[#CF1824] sm:self-auto"
          >
            <FileDown
              size={
                15
              }
            />

            Gerar relatório
          </button>
        </div>

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
            >
              <option value="">
                Todas as linhas
              </option>

              {lines.map(
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
            >
              <option value="">
                Todos os equipamentos
              </option>

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
            >
              <RotateCcw
                size={
                  15
                }
              />

              Limpar
            </button>
          </div>
        </section>

        {error && (
          <div className="mt-8 rounded-[14px] border border-[#F0D2D5] bg-surface-elevated px-4 py-3 text-[12px] text-[#BF2C35]">
            {error}
          </div>
        )}

        {loading &&
          !data && (
          <div className="flex min-h-[420px] items-center justify-center">
            <LoaderCircle
              size={
                22
              }
              className="animate-spin text-[#E41E2B]"
            />
          </div>
        )}

        {data && (
          <>
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
                    01
                  </div>

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

              <div className="px-6 py-5 sm:px-8 sm:py-6">
                <FailureOriginAnalysis
                  data={
                    data
                      .failureOrigin
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
                  onChanged={
                    loadData
                  }
                />
              </div>
            </section>

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
              </div>

              <div className="p-4 sm:p-6">
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
              </div>

              <div className="p-4 sm:p-6">
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
        } : undefined}
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
