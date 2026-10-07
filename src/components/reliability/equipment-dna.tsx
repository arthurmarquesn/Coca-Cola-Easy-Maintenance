"use client";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock3,
  Factory,
  Fingerprint,
  LoaderCircle,
  Package,
  TimerReset,
  Wrench,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

type DnaMetric =
  | "OCCURRENCES"
  | "DOWNTIME";

type TimelineMetric =
  | "OCCURRENCES"
  | "DOWNTIME"
  | "MTTR";

type TimelineGrouping =
  | "DAY"
  | "WEEK"
  | "MONTH";

interface EquipmentDnaProps {
  open: boolean;
  equipment: string;

  startDate?:
    | string
    | null;

  endDate?:
    | string
    | null;

  line?:
    | string
    | null;

  onClose:
    () => void;
}

interface DnaLineItem {
  name: string;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
}

interface DnaEquipmentInfo {
  name: string;
  lines: DnaLineItem[];
  firstEventDate:
    | string
    | null;
  lastEventDate:
    | string
    | null;
}

interface DnaSummary {
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
  classifiedOccurrences: number;
  unclassifiedOccurrences: number;
  classificationCoverage: number;
  failureModes: number;
  products: number;
}

interface DnaOriginItem {
  occurrences: number;
  downtimeMinutes: number;
  percentage: number;
}

interface DnaOrigin {
  operation: DnaOriginItem;
  maintenance: DnaOriginItem;
  unclassified: DnaOriginItem;
}

interface DnaProductItem {
  code:
    | string
    | null;

  description:
    | string
    | null;

  label: string;
  occurrences: number;
  downtimeMinutes: number;
  occurrencePercentage: number;
  downtimePercentage?: number;
}

interface DnaFailureItem {
  failureMode: string;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
  occurrencePercentage: number;
  downtimePercentage: number;
  products: DnaProductItem[];
}

interface DnaTimelineItem {
  periodStart:
    | string
    | null;

  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
}

interface DnaResponse {
  success?: boolean;
  message?: string;
  equipment?: unknown;
  summary?: unknown;
  origin?: unknown;
  failures?: unknown;
  products?: unknown;
  timeline?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

function toNumber(
  value:
    unknown,
): number {
  const parsed =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function safeText(
  value:
    unknown,
  fallback =
    "",
): string {
  if (
    typeof value !==
    "string"
  ) {
    return fallback;
  }

  const result =
    value.trim();

  return result ||
    fallback;
}

function formatNumber(
  value:
    number,
  maximumFractionDigits =
    0,
): string {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits,
    },
  ).format(
    Number.isFinite(
      value,
    )
      ? value
      : 0,
  );
}

function formatPercentage(
  value:
    number,
): string {
  return `${formatNumber(
    value,
    1,
  )}%`;
}

function formatDate(
  value:
    string | null,
): string {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return value ??
      "—";
  }

  const [
    year,
    month,
    day,
  ] =
    value.split(
      "-",
    );

  return `${day}/${month}/${year}`;
}

function parseDateOnly(
  value?:
    | string
    | null,
): Date | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split(
        "-",
      )
      .map(
        Number,
      );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function recommendedGrouping(
  startDate?:
    | string
    | null,
  endDate?:
    | string
    | null,
): TimelineGrouping {
  const start =
    parseDateOnly(
      startDate,
    );

  const end =
    parseDateOnly(
      endDate,
    );

  if (
    !start ||
    !end
  ) {
    return "DAY";
  }

  const days =
    Math.max(
      1,
      Math.round(
        (
          end.getTime() -
          start.getTime()
        ) /
          86400000,
      ) +
        1,
    );

  if (
    days <=
    45
  ) {
    return "DAY";
  }

  if (
    days <=
    240
  ) {
    return "WEEK";
  }

  return "MONTH";
}

function normalizeProduct(
  raw:
    unknown,
): DnaProductItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as
      Record<
        string,
        unknown
      >;

  return {
    code:
      typeof source.code ===
        "string"
        ? source.code.trim() ||
          null
        : null,

    description:
      typeof source.description ===
        "string"
        ? source.description.trim() ||
          null
        : null,

    label:
      safeText(
        source.label,
        "Produto não informado",
      ),

    occurrences:
      Math.max(
        0,
        toNumber(
          source.occurrences,
        ),
      ),

    downtimeMinutes:
      Math.max(
        0,
        toNumber(
          source.downtimeMinutes,
        ),
      ),

    occurrencePercentage:
      Math.max(
        0,
        toNumber(
          source.occurrencePercentage,
        ),
      ),

    downtimePercentage:
      Math.max(
        0,
        toNumber(
          source.downtimePercentage,
        ),
      ),
  };
}

function normalizeFailure(
  raw:
    unknown,
): DnaFailureItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as
      Record<
        string,
        unknown
      >;

  const failureMode =
    safeText(
      source.failureMode,
    );

  if (
    !failureMode
  ) {
    return null;
  }

  const products =
    Array.isArray(
      source.products,
    )
      ? source.products
          .map(
            normalizeProduct,
          )
          .filter(
            (
              item,
            ): item is DnaProductItem =>
              item !==
              null,
          )
      : [];

  return {
    failureMode,

    occurrences:
      Math.max(
        0,
        toNumber(
          source.occurrences,
        ),
      ),

    downtimeMinutes:
      Math.max(
        0,
        toNumber(
          source.downtimeMinutes,
        ),
      ),

    mttr:
      Math.max(
        0,
        toNumber(
          source.mttr,
        ),
      ),

    occurrencePercentage:
      Math.max(
        0,
        toNumber(
          source.occurrencePercentage,
        ),
      ),

    downtimePercentage:
      Math.max(
        0,
        toNumber(
          source.downtimePercentage,
        ),
      ),

    products,
  };
}

function normalizeOriginItem(
  raw:
    unknown,
): DnaOriginItem {
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

  return {
    occurrences:
      Math.max(
        0,
        toNumber(
          source.occurrences,
        ),
      ),

    downtimeMinutes:
      Math.max(
        0,
        toNumber(
          source.downtimeMinutes,
        ),
      ),

    percentage:
      Math.max(
        0,
        toNumber(
          source.percentage,
        ),
      ),
  };
}

function normalizeTimelineItem(
  raw:
    unknown,
): DnaTimelineItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as
      Record<
        string,
        unknown
      >;

  return {
    periodStart:
      typeof source.periodStart ===
        "string"
        ? source.periodStart
        : null,

    occurrences:
      Math.max(
        0,
        toNumber(
          source.occurrences,
        ),
      ),

    downtimeMinutes:
      Math.max(
        0,
        toNumber(
          source.downtimeMinutes,
        ),
      ),

    mttr:
      Math.max(
        0,
        toNumber(
          source.mttr,
        ),
      ),
  };
}

function normalizeLineItem(
  raw:
    unknown,
): DnaLineItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as
      Record<
        string,
        unknown
      >;

  const name =
    safeText(
      source.name,
    );

  if (
    !name
  ) {
    return null;
  }

  return {
    name,

    occurrences:
      Math.max(
        0,
        toNumber(
          source.occurrences,
        ),
      ),

    downtimeMinutes:
      Math.max(
        0,
        toNumber(
          source.downtimeMinutes,
        ),
      ),

    mttr:
      Math.max(
        0,
        toNumber(
          source.mttr,
        ),
      ),
  };
}

function dnaMetricValue(
  item:
    DnaFailureItem,
  metric:
    DnaMetric,
): number {
  return metric ===
    "DOWNTIME"
    ? item.downtimeMinutes
    : item.occurrences;
}

function productMetricValue(
  item:
    DnaProductItem,
  metric:
    DnaMetric,
): number {
  return metric ===
    "DOWNTIME"
    ? item.downtimeMinutes
    : item.occurrences;
}

function timelineMetricValue(
  item:
    DnaTimelineItem,
  metric:
    TimelineMetric,
): number {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return item.downtimeMinutes;
  }

  if (
    metric ===
    "MTTR"
  ) {
    return item.mttr;
  }

  return item.occurrences;
}

function metricLabel(
  value:
    number,
  metric:
    DnaMetric,
): string {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return `${formatNumber(
      value,
      1,
    )} min`;
  }

  return formatNumber(
    value,
  );
}

function timelineMetricLabel(
  value:
    number,
  metric:
    TimelineMetric,
): string {
  if (
    metric ===
    "OCCURRENCES"
  ) {
    return formatNumber(
      value,
    );
  }

  return `${formatNumber(
    value,
    1,
  )} min`;
}

function formatPeriodLabel(
  value:
    string | null,
  grouping:
    TimelineGrouping,
): string {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return value ??
      "—";
  }

  const [
    year,
    month,
    day,
  ] =
    value.split(
      "-",
    );

  if (
    grouping ===
    "MONTH"
  ) {
    return `${month}/${year.slice(
      -2,
    )}`;
  }

  if (
    grouping ===
    "WEEK"
  ) {
    return `Sem. ${day}/${month}`;
  }

  return `${day}/${month}`;
}

function buildTickIndexes(
  length:
    number,
): number[] {
  if (
    length <=
    0
  ) {
    return [];
  }

  if (
    length <=
    7
  ) {
    return Array.from(
      {
        length,
      },
      (
        _,
        index,
      ) => index,
    );
  }

  const indexes =
    new Set<number>();

  for (
    let index =
      0;
    index <
      7;
    index +=
      1
  ) {
    indexes.add(
      Math.round(
        (
          index *
          (
            length -
            1
          )
        ) /
          6,
      ),
    );
  }

  return [
    ...indexes,
  ].sort(
    (
      a,
      b,
    ) =>
      a -
      b,
  );
}

/* =========================================================
   COMPONENTE
========================================================= */

export function EquipmentDna({
  open,
  equipment,
  startDate,
  endDate,
  line,
  onClose,
}: EquipmentDnaProps) {
  const [
    metric,
    setMetric,
  ] =
    useState<DnaMetric>(
      "OCCURRENCES",
    );

  const [
    timelineMetric,
    setTimelineMetric,
  ] =
    useState<TimelineMetric>(
      "OCCURRENCES",
    );

  const [
    grouping,
    setGrouping,
  ] =
    useState<TimelineGrouping>(
      () =>
        recommendedGrouping(
          startDate,
          endDate,
        ),
    );

  const [
    equipmentInfo,
    setEquipmentInfo,
  ] =
    useState<DnaEquipmentInfo | null>(
      null,
    );

  const [
    summary,
    setSummary,
  ] =
    useState<DnaSummary>({
      occurrences:
        0,

      downtimeMinutes:
        0,

      mttr:
        0,

      classifiedOccurrences:
        0,

      unclassifiedOccurrences:
        0,

      classificationCoverage:
        0,

      failureModes:
        0,

      products:
        0,
    });

  const [
    origin,
    setOrigin,
  ] =
    useState<DnaOrigin>({
      operation: {
        occurrences:
          0,

        downtimeMinutes:
          0,

        percentage:
          0,
      },

      maintenance: {
        occurrences:
          0,

        downtimeMinutes:
          0,

        percentage:
          0,
      },

      unclassified: {
        occurrences:
          0,

        downtimeMinutes:
          0,

        percentage:
          0,
      },
    });

  const [
    failures,
    setFailures,
  ] =
    useState<DnaFailureItem[]>(
      [],
    );

  const [
    products,
    setProducts,
  ] =
    useState<DnaProductItem[]>(
      [],
    );

  const [
    timeline,
    setTimeline,
  ] =
    useState<DnaTimelineItem[]>(
      [],
    );

  const [
    selectedFailureMode,
    setSelectedFailureMode,
  ] =
    useState<string | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    hoveredTimelineIndex,
    setHoveredTimelineIndex,
  ] =
    useState<number | null>(
      null,
    );

  /* =======================================================
     MODAL
  ======================================================= */

  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }

      const oldOverflow =
        document.body.style
          .overflow;

      document.body.style
        .overflow =
        "hidden";

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
    },
    [
      open,
      onClose,
    ],
  );

  /*
   * Ajusta o agrupamento durante a renderização quando o
   * período muda (padrão recomendado pelo React em vez de
   * setState dentro de useEffect).
   */
  const periodKey =
    `${startDate}|${endDate}`;

  const [
    groupingPeriodKey,
    setGroupingPeriodKey,
  ] =
    useState(
      periodKey,
    );

  if (
    groupingPeriodKey !==
    periodKey
  ) {
    setGroupingPeriodKey(
      periodKey,
    );

    setGrouping(
      recommendedGrouping(
        startDate,
        endDate,
      ),
    );
  }

  /* =======================================================
     DADOS
  ======================================================= */

  useEffect(
    () => {
      if (
        !open ||
        !equipment.trim()
      ) {
        return;
      }

      const controller =
        new AbortController();

      async function loadDna() {
        setLoading(
          true,
        );

        setError(
          "",
        );

        setHoveredTimelineIndex(
          null,
        );

        try {
          const params =
            new URLSearchParams();

          params.set(
            "equipment",
            equipment,
          );

          params.set(
            "groupBy",
            grouping,
          );

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

          const response =
            await fetch(
              `/api/analytics/reliability/equipment-dna?${params.toString()}`,
              {
                cache:
                  "no-store",

                signal:
                  controller.signal,
              },
            );

          const raw:
            DnaResponse =
            await response.json();

          if (
            !response.ok ||
            !raw.success
          ) {
            throw new Error(
              raw.message ??
                "Não foi possível carregar o DNA do equipamento.",
            );
          }

          const equipmentRaw =
            raw.equipment &&
            typeof raw.equipment ===
              "object"
              ? raw.equipment as
                  Record<
                    string,
                    unknown
                  >
              : {};

          const normalizedLines =
            Array.isArray(
              equipmentRaw.lines,
            )
              ? equipmentRaw.lines
                  .map(
                    normalizeLineItem,
                  )
                  .filter(
                    (
                      item,
                    ): item is DnaLineItem =>
                      item !==
                      null,
                  )
              : [];

          setEquipmentInfo({
            name:
              safeText(
                equipmentRaw.name,
                equipment,
              ),

            lines:
              normalizedLines,

            firstEventDate:
              typeof equipmentRaw.firstEventDate ===
                "string"
                ? equipmentRaw.firstEventDate
                : null,

            lastEventDate:
              typeof equipmentRaw.lastEventDate ===
                "string"
                ? equipmentRaw.lastEventDate
                : null,
          });

          const summaryRaw =
            raw.summary &&
            typeof raw.summary ===
              "object"
              ? raw.summary as
                  Record<
                    string,
                    unknown
                  >
              : {};

          setSummary({
            occurrences:
              Math.max(
                0,
                toNumber(
                  summaryRaw.occurrences,
                ),
              ),

            downtimeMinutes:
              Math.max(
                0,
                toNumber(
                  summaryRaw.downtimeMinutes,
                ),
              ),

            mttr:
              Math.max(
                0,
                toNumber(
                  summaryRaw.mttr,
                ),
              ),

            classifiedOccurrences:
              Math.max(
                0,
                toNumber(
                  summaryRaw.classifiedOccurrences,
                ),
              ),

            unclassifiedOccurrences:
              Math.max(
                0,
                toNumber(
                  summaryRaw.unclassifiedOccurrences,
                ),
              ),

            classificationCoverage:
              Math.max(
                0,
                toNumber(
                  summaryRaw.classificationCoverage,
                ),
              ),

            failureModes:
              Math.max(
                0,
                toNumber(
                  summaryRaw.failureModes,
                ),
              ),

            products:
              Math.max(
                0,
                toNumber(
                  summaryRaw.products,
                ),
              ),
          });

          const originRaw =
            raw.origin &&
            typeof raw.origin ===
              "object"
              ? raw.origin as
                  Record<
                    string,
                    unknown
                  >
              : {};

          setOrigin({
            operation:
              normalizeOriginItem(
                originRaw.operation,
              ),

            maintenance:
              normalizeOriginItem(
                originRaw.maintenance,
              ),

            unclassified:
              normalizeOriginItem(
                originRaw.unclassified,
              ),
          });

          const normalizedFailures =
            Array.isArray(
              raw.failures,
            )
              ? raw.failures
                  .map(
                    normalizeFailure,
                  )
                  .filter(
                    (
                      item,
                    ): item is DnaFailureItem =>
                      item !==
                      null,
                  )
              : [];

          setFailures(
            normalizedFailures,
          );

          setSelectedFailureMode(
            (
              current,
            ) => {
              if (
                current &&
                normalizedFailures.some(
                  (
                    item,
                  ) =>
                    item.failureMode ===
                    current,
                )
              ) {
                return current;
              }

              return normalizedFailures[
                0
              ]?.failureMode ??
                null;
            },
          );

          setProducts(
            Array.isArray(
              raw.products,
            )
              ? raw.products
                  .map(
                    normalizeProduct,
                  )
                  .filter(
                    (
                      item,
                    ): item is DnaProductItem =>
                      item !==
                      null,
                  )
              : [],
          );

          setTimeline(
            Array.isArray(
              raw.timeline,
            )
              ? raw.timeline
                  .map(
                    normalizeTimelineItem,
                  )
                  .filter(
                    (
                      item,
                    ): item is DnaTimelineItem =>
                      item !==
                      null,
                  )
              : [],
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
              : "Não foi possível carregar o DNA do equipamento.",
          );
        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(
              false,
            );
          }
        }
      }

      void loadDna();

      return () => {
        controller.abort();
      };
    },
    [
      open,
      equipment,
      startDate,
      endDate,
      line,
      grouping,
    ],
  );

  /* =======================================================
     RANKINGS
  ======================================================= */

  const sortedFailures =
    useMemo(
      () =>
        [
          ...failures,
        ].sort(
          (
            a,
            b,
          ) => {
            const difference =
              dnaMetricValue(
                b,
                metric,
              ) -
              dnaMetricValue(
                a,
                metric,
              );

            if (
              difference !==
              0
            ) {
              return difference;
            }

            return a.failureMode.localeCompare(
              b.failureMode,
              "pt-BR",
            );
          },
        ),
      [
        failures,
        metric,
      ],
    );

  const visibleFailures =
    sortedFailures.slice(
      0,
      6,
    );

  const maxFailureValue =
    Math.max(
      1,
      ...visibleFailures.map(
        (
          item,
        ) =>
          dnaMetricValue(
            item,
            metric,
          ),
      ),
    );

  const selectedFailure =
    useMemo(
      () =>
        failures.find(
          (
            item,
          ) =>
            item.failureMode ===
            selectedFailureMode,
        ) ??
        sortedFailures[
          0
        ] ??
        null,
      [
        failures,
        sortedFailures,
        selectedFailureMode,
      ],
    );

  const selectedFailureProducts =
    useMemo(
      () => {
        if (
          !selectedFailure
        ) {
          return [];
        }

        return [
          ...selectedFailure.products,
        ]
          .sort(
            (
              a,
              b,
            ) =>
              productMetricValue(
                b,
                metric,
              ) -
              productMetricValue(
                a,
                metric,
              ),
          )
          .slice(
            0,
            5,
          );
      },
      [
        selectedFailure,
        metric,
      ],
    );

  const maxFailureProductValue =
    Math.max(
      1,
      ...selectedFailureProducts.map(
        (
          item,
        ) =>
          productMetricValue(
            item,
            metric,
          ),
      ),
    );

  const visibleProducts =
    useMemo(
      () =>
        [
          ...products,
        ]
          .sort(
            (
              a,
              b,
            ) =>
              productMetricValue(
                b,
                metric,
              ) -
              productMetricValue(
                a,
                metric,
              ),
          )
          .slice(
            0,
            5,
          ),
      [
        products,
        metric,
      ],
    );

  const maxProductValue =
    Math.max(
      1,
      ...visibleProducts.map(
        (
          item,
        ) =>
          productMetricValue(
            item,
            metric,
          ),
      ),
    );

  /* =======================================================
     TIMELINE
  ======================================================= */

  const chartWidth =
    1000;

  const chartHeight =
    270;

  const chartMargin = {
    top:
      20,

    right:
      22,

    bottom:
      44,

    left:
      58,
  };

  const plotWidth =
    chartWidth -
    chartMargin.left -
    chartMargin.right;

  const plotHeight =
    chartHeight -
    chartMargin.top -
    chartMargin.bottom;

  const timelineValues =
    timeline.map(
      (
        item,
      ) =>
        timelineMetricValue(
          item,
          timelineMetric,
        ),
    );

  const timelineMax =
    Math.max(
      1,
      ...timelineValues,
    );

  const timelinePoints =
    timeline.map(
      (
        item,
        index,
      ) => {
        const value =
          timelineMetricValue(
            item,
            timelineMetric,
          );

        const x =
          timeline.length <=
          1
            ? chartMargin.left +
              plotWidth /
                2
            : chartMargin.left +
              (
                index /
                (
                  timeline.length -
                  1
                )
              ) *
                plotWidth;

        const y =
          chartMargin.top +
          plotHeight -
          (
            value /
            timelineMax
          ) *
            plotHeight;

        return {
          item,
          index,
          value,
          x,
          y,
        };
      },
    );

  const timelinePath =
    timelinePoints
      .map(
        (
          point,
          index,
        ) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(
            2,
          )} ${point.y.toFixed(
            2,
          )}`,
      )
      .join(
        " ",
      );

  const timelineTickIndexes =
    buildTickIndexes(
      timeline.length,
    );

  const hoveredTimelinePoint =
    hoveredTimelineIndex ===
      null
      ? null
      : timelinePoints[
          hoveredTimelineIndex
        ] ??
        null;

  /* =======================================================
     FECHADO
  ======================================================= */

  if (
    !open
  ) {
    return null;
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`DNA do equipamento ${equipment}`}
    >
      <button
        type="button"
        aria-label="Fechar DNA do equipamento"
        onClick={
          onClose
        }
        className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-[3px]"
      />

      <div className="relative flex max-h-[94vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[24px] border border-border-theme bg-background-primary shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
        {/* =================================================
            CABEÇALHO
        ================================================== */}

        <div className="flex shrink-0 items-start justify-between gap-6 border-b border-border-theme bg-surface px-6 py-5 sm:px-8">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-inverse text-white">
              <Fingerprint
                size={20}
              />
            </div>

            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                DNA do equipamento
              </p>

              <h2 className="mt-1 truncate text-[24px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[28px]">
                {equipmentInfo
                  ?.name ??
                  equipment}
              </h2>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-text-muted">
                {line && (
                  <span>
                    {line}
                  </span>
                )}

                {startDate &&
                  endDate && (
                  <span>
                    {formatDate(
                      startDate,
                    )}
                    {" → "}
                    {formatDate(
                      endDate,
                    )}
                  </span>
                )}

                {equipmentInfo
                  ?.firstEventDate &&
                  equipmentInfo
                    ?.lastEventDate && (
                  <span>
                    Histórico no recorte:{" "}
                    {formatDate(
                      equipmentInfo.firstEventDate,
                    )}{" "}
                    a{" "}
                    {formatDate(
                      equipmentInfo.lastEventDate,
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {loading && (
              <div className="hidden items-center gap-2 text-[10px] text-text-secondary sm:flex">
                <LoaderCircle
                  size={14}
                  className="animate-spin text-accent-primary"
                />

                Atualizando
              </div>
            )}

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            >
              <X
                size={18}
              />
            </button>
          </div>
        </div>

        {/* =================================================
            CORPO
        ================================================== */}

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          {error ? (
            <div className="rounded-[16px] border border-accent-primary/30 bg-accent-soft px-4 py-4">
              <div className="flex gap-3">
                <AlertTriangle
                  size={17}
                  className="mt-0.5 shrink-0 text-accent-primary"
                />

                <p className="text-[11px] leading-5 text-accent-primary">
                  {error}
                </p>
              </div>
            </div>
          ) : loading &&
            !equipmentInfo ? (
            <div className="flex min-h-[520px] items-center justify-center">
              <LoaderCircle
                size={24}
                className="animate-spin text-accent-primary"
              />
            </div>
          ) : (
            <div
              className={
                `space-y-5 transition-opacity ${
                  loading
                    ? "opacity-60"
                    : "opacity-100"
                }`
              }
            >
              {/* ===========================================
                  RESUMO
              ============================================ */}

              <section className="grid overflow-hidden rounded-[20px] border border-border-theme bg-surface-hover sm:grid-cols-2 xl:grid-cols-4">
                <div className="bg-surface px-5 py-4">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Activity
                      size={13}
                    />

                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                      Ocorrências
                    </p>
                  </div>

                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-text-primary">
                    {formatNumber(
                      summary.occurrences,
                    )}
                  </p>
                </div>

                <div className="bg-surface px-5 py-4">
                  <div className="flex items-center gap-2 text-text-muted">
                    <TimerReset
                      size={13}
                    />

                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                      Tempo de parada
                    </p>
                  </div>

                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-text-primary">
                    {formatNumber(
                      summary.downtimeMinutes,
                      1,
                    )}

                    <span className="ml-1 text-[10px] font-medium tracking-normal text-text-muted">
                      min
                    </span>
                  </p>
                </div>

                <div className="bg-surface px-5 py-4">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Clock3
                      size={13}
                    />

                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                      MTTR
                    </p>
                  </div>

                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-text-primary">
                    {formatNumber(
                      summary.mttr,
                      1,
                    )}

                    <span className="ml-1 text-[10px] font-medium tracking-normal text-text-muted">
                      min
                    </span>
                  </p>
                </div>

                <div className="bg-surface px-5 py-4">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Wrench
                      size={13}
                    />

                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                      Cobertura das falhas
                    </p>
                  </div>

                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-text-primary">
                    {formatPercentage(
                      summary.classificationCoverage,
                    )}
                  </p>

                  <p className="mt-1 text-[9px] text-text-muted">
                    {formatNumber(
                      summary.failureModes,
                    )}{" "}
                    modos de falha
                  </p>
                </div>
              </section>

              {/* ===========================================
                  ORIGEM + PRODUTOS GERAIS
              ============================================ */}

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-[20px] border border-border-theme bg-surface p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-text-muted">
                        Origem das falhas
                      </p>

                      <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-text-primary">
                        Operação × Manutenção
                      </h3>
                    </div>

                    <p className="text-[9px] text-text-muted">
                      Origem efetiva
                    </p>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-full bg-surface-elevated">
                    <div className="flex h-3 w-full">
                      <div
                        className="h-full bg-accent-primary transition-all"
                        style={{
                          width:
                            `${Math.min(
                              100,
                              origin.maintenance.percentage,
                            )}%`,
                        }}
                      />

                      <div
                        className="h-full bg-text-muted transition-all"
                        style={{
                          width:
                            `${Math.min(
                              100,
                              origin.operation.percentage,
                            )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-[14px] bg-accent-soft p-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-accent-primary" />

                        <span className="text-[9px] font-semibold uppercase tracking-[0.07em] text-accent-primary">
                          Manutenção
                        </span>
                      </div>

                      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-accent-primary">
                        {formatPercentage(
                          origin.maintenance.percentage,
                        )}
                      </p>

                      <p className="mt-1 text-[9px] text-accent-primary">
                        {formatNumber(
                          origin.maintenance.occurrences,
                        )}{" "}
                        ocorrências
                      </p>
                    </div>

                    <div className="rounded-[14px] bg-surface-elevated p-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-text-muted" />

                        <span className="text-[9px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
                          Operação
                        </span>
                      </div>

                      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-text-primary">
                        {formatPercentage(
                          origin.operation.percentage,
                        )}
                      </p>

                      <p className="mt-1 text-[9px] text-text-muted">
                        {formatNumber(
                          origin.operation.occurrences,
                        )}{" "}
                        ocorrências
                      </p>
                    </div>
                  </div>

                  {origin.unclassified.occurrences >
                    0 && (
                    <p className="mt-4 text-[9px] text-text-muted">
                      {formatNumber(
                        origin.unclassified.occurrences,
                      )}{" "}
                      ocorrências ainda não possuem origem classificada.
                    </p>
                  )}
                </section>

                <section className="rounded-[20px] border border-border-theme bg-surface p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-text-muted">
                        Produtos associados
                      </p>

                      <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-text-primary">
                        Contexto de produção do ativo
                      </h3>
                    </div>

                    <Package
                      size={17}
                      className="text-text-muted"
                    />
                  </div>

                  <div className="mt-5 space-y-4">
                    {visibleProducts.length >
                    0 ? (
                      visibleProducts.map(
                        (
                          product,
                          index,
                        ) => {
                          const value =
                            productMetricValue(
                              product,
                              metric,
                            );

                          const width =
                            Math.max(
                              2,
                              (
                                value /
                                maxProductValue
                              ) *
                                100,
                            );

                          return (
                            <div
                              key={`${product.label}-${index}`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <p className="min-w-0 text-[10px] font-medium leading-4 text-text-body">
                                  {product.label}
                                </p>

                                <p className="shrink-0 text-[10px] font-semibold tabular-nums text-text-primary">
                                  {metricLabel(
                                    value,
                                    metric,
                                  )}
                                </p>
                              </div>

                              <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-elevated">
                                <div
                                  className="h-full rounded-full bg-surface-inverse"
                                  style={{
                                    width:
                                      `${width}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        },
                      )
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-border-theme px-4 py-7 text-center">
                        <Package
                          size={20}
                          className="mx-auto text-text-muted"
                        />

                        <p className="mt-2 text-[10px] text-text-secondary">
                          Nenhum produto identificado no recorte.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* ===========================================
                  FALHAS + FALHA X PRODUTO
              ============================================ */}

              <section className="overflow-hidden rounded-[20px] border border-border-theme bg-surface">
                <div className="flex flex-col gap-4 border-b border-border-theme px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-text-muted">
                      Assinatura de falhas
                    </p>

                    <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-text-primary">
                      O que caracteriza este equipamento
                    </h3>
                  </div>

                  <div className="inline-flex self-start rounded-[10px] border border-border-theme bg-background-primary p-1 sm:self-auto">
                    <button
                      type="button"
                      onClick={() =>
                        setMetric(
                          "OCCURRENCES",
                        )
                      }
                      className={
                        `h-8 rounded-[7px] px-3 text-[9px] font-medium transition ${
                          metric ===
                          "OCCURRENCES"
                            ? "bg-surface text-text-primary shadow-sm"
                            : "text-text-secondary"
                        }`
                      }
                    >
                      Ocorrências
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setMetric(
                          "DOWNTIME",
                        )
                      }
                      className={
                        `h-8 rounded-[7px] px-3 text-[9px] font-medium transition ${
                          metric ===
                          "DOWNTIME"
                            ? "bg-surface text-text-primary shadow-sm"
                            : "text-text-secondary"
                        }`
                      }
                    >
                      Tempo de parada
                    </button>
                  </div>
                </div>

                <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <div className="border-b border-border-theme px-5 py-5 sm:px-6 lg:border-b-0 lg:border-r">
                    <div className="space-y-2">
                      {visibleFailures.length >
                      0 ? (
                        visibleFailures.map(
                          (
                            failure,
                            index,
                          ) => {
                            const value =
                              dnaMetricValue(
                                failure,
                                metric,
                              );

                            const width =
                              Math.max(
                                2,
                                (
                                  value /
                                  maxFailureValue
                                ) *
                                  100,
                              );

                            const selected =
                              selectedFailure?.failureMode ===
                              failure.failureMode;

                            return (
                              <button
                                key={
                                  failure.failureMode
                                }
                                type="button"
                                onClick={() =>
                                  setSelectedFailureMode(
                                    failure.failureMode,
                                  )
                                }
                                className={
                                  `w-full rounded-[13px] border px-3 py-3 text-left transition ${
                                    selected
                                      ? "border-accent-primary/30 bg-accent-soft"
                                      : "border-transparent hover:border-border-theme hover:bg-background-primary"
                                  }`
                                }
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={
                                      `flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                                        selected
                                          ? "bg-accent-primary text-white"
                                          : "bg-surface-elevated text-text-secondary"
                                      }`
                                    }
                                  >
                                    {String(
                                      index +
                                        1,
                                    ).padStart(
                                      2,
                                      "0",
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-4">
                                      <p className="text-[10px] font-medium leading-4 text-text-primary">
                                        {failure.failureMode}
                                      </p>

                                      <p className="shrink-0 text-[10px] font-semibold tabular-nums text-text-primary">
                                        {metricLabel(
                                          value,
                                          metric,
                                        )}
                                      </p>
                                    </div>

                                    <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-elevated">
                                      <div
                                        className={
                                          `h-full rounded-full transition-all ${
                                            selected
                                              ? "bg-accent-primary"
                                              : "bg-surface-inverse"
                                          }`
                                        }
                                        style={{
                                          width:
                                            `${width}%`,
                                        }}
                                      />
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-text-muted">
                                      <span>
                                        {formatNumber(
                                          failure.occurrences,
                                        )}{" "}
                                        ocorr.
                                      </span>

                                      <span>
                                        {formatNumber(
                                          failure.downtimeMinutes,
                                          1,
                                        )}{" "}
                                        min
                                      </span>

                                      <span>
                                        MTTR{" "}
                                        {formatNumber(
                                          failure.mttr,
                                          1,
                                        )}{" "}
                                        min
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          },
                        )
                      ) : (
                        <div className="py-12 text-center text-[10px] text-text-secondary">
                          Nenhum modo de falha classificado para este equipamento.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-background-primary px-5 py-5 sm:px-6">
                    {selectedFailure ? (
                      <>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                          Produto × falha selecionada
                        </p>

                        <h4 className="mt-1 text-[15px] font-semibold leading-5 tracking-[-0.02em] text-text-primary">
                          {selectedFailure.failureMode}
                        </h4>

                        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-border-theme bg-surface-hover">
                          <div className="bg-surface px-3 py-3">
                            <p className="text-[7px] font-semibold uppercase tracking-[0.07em] text-text-muted">
                              Ocorr.
                            </p>

                            <p className="mt-1 text-[16px] font-semibold text-text-primary">
                              {formatNumber(
                                selectedFailure.occurrences,
                              )}
                            </p>
                          </div>

                          <div className="bg-surface px-3 py-3">
                            <p className="text-[7px] font-semibold uppercase tracking-[0.07em] text-text-muted">
                              Parada
                            </p>

                            <p className="mt-1 text-[16px] font-semibold text-text-primary">
                              {formatNumber(
                                selectedFailure.downtimeMinutes,
                                1,
                              )}
                            </p>
                          </div>

                          <div className="bg-surface px-3 py-3">
                            <p className="text-[7px] font-semibold uppercase tracking-[0.07em] text-text-muted">
                              MTTR
                            </p>

                            <p className="mt-1 text-[16px] font-semibold text-text-primary">
                              {formatNumber(
                                selectedFailure.mttr,
                                1,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 space-y-4">
                          {selectedFailureProducts.length >
                          0 ? (
                            selectedFailureProducts.map(
                              (
                                product,
                                index,
                              ) => {
                                const value =
                                  productMetricValue(
                                    product,
                                    metric,
                                  );

                                const width =
                                  Math.max(
                                    2,
                                    (
                                      value /
                                      maxFailureProductValue
                                    ) *
                                      100,
                                  );

                                return (
                                  <div
                                    key={`${product.label}-${index}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="min-w-0 text-[9px] font-medium leading-4 text-text-body">
                                        {product.label}
                                      </p>

                                      <p className="shrink-0 text-[9px] font-semibold text-text-primary">
                                        {metricLabel(
                                          value,
                                          metric,
                                        )}
                                      </p>
                                    </div>

                                    <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-hover">
                                      <div
                                        className="h-full rounded-full bg-accent-primary"
                                        style={{
                                          width:
                                            `${width}%`,
                                        }}
                                      />
                                    </div>

                                    <p className="mt-1 text-[8px] text-text-muted">
                                      {formatPercentage(
                                        product.occurrencePercentage,
                                      )}{" "}
                                      das ocorrências desta falha
                                    </p>
                                  </div>
                                );
                              },
                            )
                          ) : (
                            <div className="rounded-[12px] border border-dashed border-border-theme px-4 py-6 text-center">
                              <Package
                                size={18}
                                className="mx-auto text-text-muted"
                              />

                              <p className="mt-2 text-[9px] text-text-secondary">
                                Sem produto associado a esta falha.
                              </p>
                            </div>
                          )}
                        </div>

                        <p className="mt-5 border-t border-border-theme pt-4 text-[8px] leading-4 text-text-muted">
                          O cruzamento mostra o produto registrado no evento. Não representa, isoladamente, causalidade entre produto e falha.
                        </p>
                      </>
                    ) : (
                      <div className="flex min-h-[320px] items-center justify-center text-center text-[10px] text-text-secondary">
                        Selecione uma falha para visualizar o cruzamento com produto.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ===========================================
                  EVOLUÇÃO TEMPORAL
              ============================================ */}

              <section className="rounded-[20px] border border-border-theme bg-surface p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-text-muted">
                      Comportamento no tempo
                    </p>

                    <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-text-primary">
                      Evolução do equipamento
                    </h3>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="inline-flex rounded-[10px] border border-border-theme bg-background-primary p-1">
                      {(
                        [
                          [
                            "OCCURRENCES",
                            "Ocorrências",
                          ],
                          [
                            "DOWNTIME",
                            "Parada",
                          ],
                          [
                            "MTTR",
                            "MTTR",
                          ],
                        ] as const
                      ).map(
                        (
                          [
                            value,
                            label,
                          ],
                        ) => (
                          <button
                            key={
                              value
                            }
                            type="button"
                            onClick={() =>
                              setTimelineMetric(
                                value,
                              )
                            }
                            className={
                              `h-8 rounded-[7px] px-3 text-[9px] font-medium transition ${
                                timelineMetric ===
                                value
                                  ? "bg-surface text-text-primary shadow-sm"
                                  : "text-text-secondary"
                              }`
                            }
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>

                    <div className="inline-flex rounded-[10px] border border-border-theme bg-background-primary p-1">
                      {(
                        [
                          [
                            "DAY",
                            "Dia",
                          ],
                          [
                            "WEEK",
                            "Semana",
                          ],
                          [
                            "MONTH",
                            "Mês",
                          ],
                        ] as const
                      ).map(
                        (
                          [
                            value,
                            label,
                          ],
                        ) => (
                          <button
                            key={
                              value
                            }
                            type="button"
                            onClick={() =>
                              setGrouping(
                                value,
                              )
                            }
                            className={
                              `h-8 rounded-[7px] px-3 text-[9px] font-medium transition ${
                                grouping ===
                                value
                                  ? "bg-surface text-text-primary shadow-sm"
                                  : "text-text-secondary"
                              }`
                            }
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                {timeline.length >
                0 ? (
                  <div
                    className="relative mt-5"
                    onMouseLeave={() =>
                      setHoveredTimelineIndex(
                        null,
                      )
                    }
                  >
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="h-auto w-full overflow-visible"
                      role="img"
                      aria-label="Evolução temporal do equipamento"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map(
                        (
                          fraction,
                        ) => {
                          const y =
                            chartMargin.top +
                            fraction *
                              plotHeight;

                          const value =
                            timelineMax *
                            (
                              1 -
                              fraction
                            );

                          return (
                            <g
                              key={
                                fraction
                              }
                            >
                              <line
                                x1={
                                  chartMargin.left
                                }
                                x2={
                                  chartMargin.left +
                                  plotWidth
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
                                  chartMargin.left -
                                  10
                                }
                                y={
                                  y +
                                  4
                                }
                                textAnchor="end"
                                fontSize="9"
                                fill="var(--text-secondary)"
                              >
                                {formatNumber(
                                  value,
                                  timelineMetric ===
                                  "OCCURRENCES"
                                    ? 0
                                    : 1,
                                )}
                              </text>
                            </g>
                          );
                        },
                      )}

                      {timelinePath && (
                        <path
                          d={
                            timelinePath
                          }
                          fill="none"
                          stroke="var(--accent-primary)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {timelineTickIndexes.map(
                        (
                          index,
                        ) => {
                          const point =
                            timelinePoints[
                              index
                            ];

                          if (
                            !point
                          ) {
                            return null;
                          }

                          return (
                            <text
                              key={`tick-${index}`}
                              x={
                                point.x
                              }
                              y={
                                chartMargin.top +
                                plotHeight +
                                28
                              }
                              textAnchor="middle"
                              fontSize="9"
                              fill="var(--text-secondary)"
                            >
                              {formatPeriodLabel(
                                point.item.periodStart,
                                grouping,
                              )}
                            </text>
                          );
                        },
                      )}

                      {timelinePoints.map(
                        (
                          point,
                        ) => {
                          const active =
                            hoveredTimelineIndex ===
                            point.index;

                          return (
                            <g
                              key={`${point.item.periodStart}-${point.index}`}
                              onMouseEnter={() =>
                                setHoveredTimelineIndex(
                                  point.index,
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
                                r="12"
                                fill="transparent"
                              />

                              <circle
                                cx={
                                  point.x
                                }
                                cy={
                                  point.y
                                }
                                r={
                                  active
                                    ? 5
                                    : 3
                                }
                                fill="var(--surface)"
                                stroke="var(--accent-primary)"
                                strokeWidth={
                                  active
                                    ? 3
                                    : 2
                                }
                              />
                            </g>
                          );
                        },
                      )}
                    </svg>

                    {hoveredTimelinePoint && (
                      <div
                        className="pointer-events-none absolute z-20 min-w-[165px] rounded-[12px] bg-surface-inverse px-3 py-2.5 text-white shadow-xl"
                        style={{
                          left:
                            `${(
                              hoveredTimelinePoint.x /
                              chartWidth
                            ) *
                              100}%`,

                          top:
                            `${Math.max(
                              4,
                              (
                                hoveredTimelinePoint.y /
                                chartHeight
                              ) *
                                100 -
                                10,
                            )}%`,

                          transform:
                            hoveredTimelinePoint.x >
                            chartWidth *
                              0.7
                              ? "translate(-100%, -100%)"
                              : "translate(10px, -100%)",
                        }}
                      >
                        <p className="text-[10px] font-semibold">
                          {formatPeriodLabel(
                            hoveredTimelinePoint.item.periodStart,
                            grouping,
                          )}
                        </p>

                        <p className="mt-1.5 text-[15px] font-semibold">
                          {timelineMetricLabel(
                            hoveredTimelinePoint.value,
                            timelineMetric,
                          )}
                        </p>

                        <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[8px] text-white/65">
                          <p>
                            {formatNumber(
                              hoveredTimelinePoint.item.occurrences,
                            )}{" "}
                            ocorrências
                          </p>

                          <p>
                            {formatNumber(
                              hoveredTimelinePoint.item.downtimeMinutes,
                              1,
                            )}{" "}
                            min de parada
                          </p>

                          <p>
                            MTTR{" "}
                            {formatNumber(
                              hoveredTimelinePoint.item.mttr,
                              1,
                            )}{" "}
                            min
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 flex min-h-[240px] flex-col items-center justify-center text-center">
                    <CalendarDays
                      size={22}
                      className="text-text-muted"
                    />

                    <p className="mt-2 text-[10px] text-text-secondary">
                      Sem evolução temporal disponível para o recorte.
                    </p>
                  </div>
                )}
              </section>

              {/* ===========================================
                  LINHAS ASSOCIADAS
              ============================================ */}

              {equipmentInfo &&
                equipmentInfo.lines.length >
                  1 && (
                <section className="rounded-[20px] border border-border-theme bg-surface p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-elevated text-text-body">
                      <Factory
                        size={15}
                      />
                    </div>

                    <div>
                      <p className="text-[12px] font-semibold text-text-primary">
                        Linhas associadas ao equipamento
                      </p>

                      <p className="mt-1 text-[9px] text-text-muted">
                        O mesmo nome de equipamento aparece em mais de uma linha no recorte atual.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {equipmentInfo.lines.map(
                      (
                        item,
                      ) => (
                        <div
                          key={
                            item.name
                          }
                          className="rounded-full border border-border-theme bg-background-primary px-3 py-2 text-[9px] text-text-body"
                        >
                          <span className="font-semibold text-text-primary">
                            {item.name}
                          </span>

                          <span className="mx-1.5 text-text-muted">
                            ·
                          </span>

                          {formatNumber(
                            item.occurrences,
                          )}{" "}
                          ocorr.
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}