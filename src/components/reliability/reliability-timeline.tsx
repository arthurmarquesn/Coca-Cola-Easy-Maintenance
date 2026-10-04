"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  LoaderCircle,
  TimerReset,
  TrendingUp,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

type TimelineMetric =
  | "EVENTS"
  | "DOWNTIME"
  | "MTTR";

type TimelineGrouping =
  | "DAY"
  | "WEEK"
  | "MONTH";

interface TimelineItem {
  periodStart: string;
  label: string;
  events: number;
  downtimeMinutes: number;
  mttr: number;
}

interface TimelineSummary {
  events: number;
  downtimeMinutes: number;
  mttr: number;
}

interface TimelineVariation {
  eventsPercentage:
    | number
    | null;

  downtimePercentage:
    | number
    | null;

  mttrPercentage:
    | number
    | null;
}

interface TimelineComparison {
  previousStartDate: string;
  previousEndDate: string;

  current:
    TimelineSummary;

  previous:
    TimelineSummary;

  variation:
    TimelineVariation;
}

interface TimelineResponse {
  success: boolean;
  message?: string;

  groupBy?:
    TimelineGrouping;

  summary?:
    Partial<TimelineSummary>;

  comparison?:
    TimelineComparison | null;

  items?:
    TimelineItem[];
}

interface ReliabilityTimelineProps {
  startDate?:
    | string
    | null;

  endDate?:
    | string
    | null;

  line?:
    | string
    | null;

  equipment?:
    | string
    | null;
}

interface ChartPoint {
  item:
    TimelineItem;

  index:
    number;

  x:
    number;

  y:
    number;

  value:
    number;
}

interface ComparisonMetricProps {
  title:
    string;

  value:
    string;

  previousValue:
    string;

  variation:
    number | null;

  goodWhenDown?:
    boolean;
}

/* =========================================================
   CONSTANTES
========================================================= */

const CHART_WIDTH =
  1000;

const CHART_HEIGHT =
  330;

const MARGIN = {
  top: 22,
  right: 26,
  bottom: 52,
  left: 68,
};

const PLOT_WIDTH =
  CHART_WIDTH -
  MARGIN.left -
  MARGIN.right;

const PLOT_HEIGHT =
  CHART_HEIGHT -
  MARGIN.top -
  MARGIN.bottom;

const Y_GRID_LINES =
  5;

/* =========================================================
   HELPERS
========================================================= */

function toNumber(
  value: unknown,
): number {
  const parsed =
    Number(
      value ??
        0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function normalizeNullableNumber(
  value: unknown,
): number | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function formatNumber(
  value: number,
  maximumFractionDigits =
    0,
): string {
  return new Intl
    .NumberFormat(
      "pt-BR",
      {
        maximumFractionDigits,
      },
    )
    .format(
      Number.isFinite(
        value,
      )
        ? value
        : 0,
    );
}

function formatCompactNumber(
  value: number,
): string {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return "0";
  }

  if (
    Math.abs(
      value,
    ) >=
    1000
  ) {
    return new Intl
      .NumberFormat(
        "pt-BR",
        {
          notation:
            "compact",

          maximumFractionDigits:
            1,
        },
      )
      .format(
        value,
      );
  }

  return formatNumber(
    value,
    1,
  );
}

function formatMinutes(
  value: number,
): string {
  const safe =
    Math.max(
      0,
      Number.isFinite(
        value,
      )
        ? value
        : 0,
    );

  if (
    safe >=
    60
  ) {
    return `${formatNumber(
      safe /
        60,
      1,
    )} h`;
  }

  return `${formatNumber(
    safe,
    1,
  )} min`;
}

function formatDatePtBr(
  value:
    | string
    | null
    | undefined,
): string {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return "—";
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

function metricValue(
  item:
    TimelineItem,

  metric:
    TimelineMetric,
): number {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return item
      .downtimeMinutes;
  }

  if (
    metric ===
    "MTTR"
  ) {
    return item.mttr;
  }

  return item.events;
}

function metricTitle(
  metric:
    TimelineMetric,
): string {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return "Tempo de parada";
  }

  if (
    metric ===
    "MTTR"
  ) {
    return "MTTR";
  }

  return "Ocorrências";
}

function metricDescription(
  metric:
    TimelineMetric,
): string {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return "Minutos totais de parada ao longo do período";
  }

  if (
    metric ===
    "MTTR"
  ) {
    return "Tempo médio de reparo em cada período";
  }

  return "Quantidade de falhas registradas ao longo do período";
}

function formatMetricValue(
  value:
    number,

  metric:
    TimelineMetric,
): string {
  if (
    metric ===
    "EVENTS"
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

function summaryMetricValue(
  summary:
    TimelineSummary,

  metric:
    TimelineMetric,
): number {
  if (
    metric ===
    "DOWNTIME"
  ) {
    return summary
      .downtimeMinutes;
  }

  if (
    metric ===
    "MTTR"
  ) {
    return summary.mttr;
  }

  return summary.events;
}

function groupingLabel(
  grouping:
    TimelineGrouping,
): string {
  if (
    grouping ===
    "WEEK"
  ) {
    return "Semana";
  }

  if (
    grouping ===
    "MONTH"
  ) {
    return "Mês";
  }

  return "Dia";
}

function niceMax(
  value:
    number,
): number {
  if (
    !Number.isFinite(
      value,
    ) ||
    value <=
      0
  ) {
    return 1;
  }

  const roughStep =
    value /
    Y_GRID_LINES;

  const magnitude =
    10 **
    Math.floor(
      Math.log10(
        roughStep,
      ),
    );

  const normalized =
    roughStep /
    magnitude;

  let niceNormalized =
    1;

  if (
    normalized <=
    1
  ) {
    niceNormalized =
      1;
  } else if (
    normalized <=
    2
  ) {
    niceNormalized =
      2;
  } else if (
    normalized <=
    5
  ) {
    niceNormalized =
      5;
  } else {
    niceNormalized =
      10;
  }

  const step =
    niceNormalized *
    magnitude;

  return (
    Math.ceil(
      value /
        step,
    ) *
    step
  );
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
    8
  ) {
    return Array.from(
      {
        length,
      },
      (
        _,
        index,
      ) =>
        index,
    );
  }

  const desired =
    8;

  const indexes =
    new Set<number>();

  for (
    let index =
      0;

    index <
    desired;

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
          (
            desired -
            1
          ),
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

function comparisonStatus({
  variation,
  goodWhenDown,
}: {
  variation:
    number | null;

  goodWhenDown:
    boolean;
}): {
  label:
    string;

  className:
    string;

  icon:
    typeof ArrowRight;
} {
  if (
    variation ===
    null
  ) {
    return {
      label:
        "Sem base anterior",

      className:
        "text-[#92979D]",

      icon:
        ArrowRight,
    };
  }

  if (
    Math.abs(
      variation,
    ) <
    0.01
  ) {
    return {
      label:
        "Estável",

      className:
        "text-[#7A7F85]",

      icon:
        ArrowRight,
    };
  }

  const wentDown =
    variation <
    0;

  const improved =
    goodWhenDown
      ? wentDown
      : !wentDown;

  return {
    label:
      improved
        ? "Melhora"
        : "Piora",

    className:
      improved
        ? "text-[#4F6B5D]"
        : "text-[#C92832]",

    icon:
      wentDown
        ? ArrowDownRight
        : ArrowUpRight,
  };
}

/* =========================================================
   COMPONENTE DE COMPARAÇÃO
========================================================= */

function ComparisonMetric({
  title,
  value,
  previousValue,
  variation,
  goodWhenDown =
    true,
}: ComparisonMetricProps) {
  const status =
    comparisonStatus({
      variation,
      goodWhenDown,
    });

  const Icon =
    status.icon;

  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <p className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#9CA1A7]">
        {title}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
        <p className="text-[27px] font-semibold leading-none tracking-[-0.055em] text-[#202327]">
          {value}
        </p>

        <div
          className={[
            "mb-0.5 inline-flex items-center gap-1 text-[9px] font-semibold",
            status.className,
          ].join(
            " ",
          )}
        >
          <Icon
            size={13}
          />

          {variation ===
          null
            ? "—"
            : `${variation > 0
                ? "+"
                : ""}${formatNumber(
                variation,
                1,
              )}%`}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] text-[#9A9FA5]">
        <span>
          anterior:
          {" "}
          {previousValue}
        </span>

        <span className="text-[#C5C8CB]">
          ·
        </span>

        <span
          className={status.className}
        >
          {status.label}
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   COMPONENTE
========================================================= */

export function ReliabilityTimeline({
  startDate,
  endDate,
  line,
  equipment,
}: ReliabilityTimelineProps) {
  const [
    metric,
    setMetric,
  ] =
    useState<TimelineMetric>(
      "EVENTS",
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
    items,
    setItems,
  ] =
    useState<
      TimelineItem[]
    >(
      [],
    );

  const [
    summary,
    setSummary,
  ] =
    useState<TimelineSummary>({
      events: 0,
      downtimeMinutes: 0,
      mttr: 0,
    });

  const [
    comparison,
    setComparison,
  ] =
    useState<
      TimelineComparison | null
    >(
      null,
    );

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
    useState(
      "",
    );

  const [
    hoveredIndex,
    setHoveredIndex,
  ] =
    useState<
      number | null
    >(
      null,
    );

  /* =======================================================
     AGRUPAMENTO AUTOMÁTICO
  ======================================================= */

  useEffect(
    () => {
      setGrouping(
        recommendedGrouping(
          startDate,
          endDate,
        ),
      );
    },
    [
      startDate,
      endDate,
    ],
  );

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  useEffect(
    () => {
      const controller =
        new AbortController();

      async function loadTimeline() {
        setLoading(
          true,
        );

        setError(
          "",
        );

        setHoveredIndex(
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

          params.set(
            "groupBy",
            grouping,
          );

          const response =
            await fetch(
              `/api/analytics/reliability/timeline?${params.toString()}`,
              {
                cache:
                  "no-store",

                signal:
                  controller.signal,
              },
            );

          const contentType =
            response.headers.get(
              "content-type",
            ) ??
            "";

          if (
            !contentType.includes(
              "application/json",
            )
          ) {
            throw new Error(
              `A API retornou uma resposta inválida (${response.status}).`,
            );
          }

          const raw:
            TimelineResponse =
            await response.json();

          if (
            !response.ok ||
            !raw.success
          ) {
            throw new Error(
              raw.message ??
                "Não foi possível carregar a evolução temporal.",
            );
          }

          const normalizedItems =
            Array.isArray(
              raw.items,
            )
              ? raw.items.map(
                  (
                    item,
                  ) => ({
                    periodStart:
                      typeof item.periodStart ===
                        "string"
                        ? item.periodStart
                        : "",

                    label:
                      typeof item.label ===
                        "string"
                        ? item.label
                        : "",

                    events:
                      Math.max(
                        0,
                        toNumber(
                          item.events,
                        ),
                      ),

                    downtimeMinutes:
                      Math.max(
                        0,
                        toNumber(
                          item.downtimeMinutes,
                        ),
                      ),

                    mttr:
                      Math.max(
                        0,
                        toNumber(
                          item.mttr,
                        ),
                      ),
                  }),
                )
              : [];

          setItems(
            normalizedItems,
          );

          setSummary({
            events:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.events,
                ),
              ),

            downtimeMinutes:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.downtimeMinutes,
                ),
              ),

            mttr:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.mttr,
                ),
              ),
          });

          if (
            raw.comparison
          ) {
            setComparison({
              previousStartDate:
                typeof raw
                  .comparison
                  .previousStartDate ===
                  "string"
                  ? raw
                      .comparison
                      .previousStartDate
                  : "",

              previousEndDate:
                typeof raw
                  .comparison
                  .previousEndDate ===
                  "string"
                  ? raw
                      .comparison
                      .previousEndDate
                  : "",

              current: {
                events:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .current
                        .events,
                    ),
                  ),

                downtimeMinutes:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .current
                        .downtimeMinutes,
                    ),
                  ),

                mttr:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .current
                        .mttr,
                    ),
                  ),
              },

              previous: {
                events:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .previous
                        .events,
                    ),
                  ),

                downtimeMinutes:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .previous
                        .downtimeMinutes,
                    ),
                  ),

                mttr:
                  Math.max(
                    0,
                    toNumber(
                      raw
                        .comparison
                        .previous
                        .mttr,
                    ),
                  ),
              },

              variation: {
                eventsPercentage:
                  normalizeNullableNumber(
                    raw
                      .comparison
                      .variation
                      .eventsPercentage,
                  ),

                downtimePercentage:
                  normalizeNullableNumber(
                    raw
                      .comparison
                      .variation
                      .downtimePercentage,
                  ),

                mttrPercentage:
                  normalizeNullableNumber(
                    raw
                      .comparison
                      .variation
                      .mttrPercentage,
                  ),
              },
            });
          } else {
            setComparison(
              null,
            );
          }
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

          setItems(
            [],
          );

          setSummary({
            events: 0,
            downtimeMinutes: 0,
            mttr: 0,
          });

          setComparison(
            null,
          );

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "Não foi possível carregar a evolução temporal.",
          );
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setLoading(
              false,
            );
          }
        }
      }

      void loadTimeline();

      return () => {
        controller.abort();
      };
    },
    [
      startDate,
      endDate,
      line,
      equipment,
      grouping,
    ],
  );

  /* =======================================================
     CÁLCULOS DO GRÁFICO
  ======================================================= */

  const values =
    useMemo(
      () =>
        items.map(
          (
            item,
          ) =>
            metricValue(
              item,
              metric,
            ),
        ),
      [
        items,
        metric,
      ],
    );

  const yMax =
    useMemo(
      () =>
        niceMax(
          Math.max(
            0,
            ...values,
          ),
        ),
      [
        values,
      ],
    );

  const points =
    useMemo<
      ChartPoint[]
    >(
      () =>
        items.map(
          (
            item,
            index,
          ) => {
            const value =
              metricValue(
                item,
                metric,
              );

            const x =
              items.length <=
              1
                ? MARGIN.left +
                  PLOT_WIDTH /
                    2
                : MARGIN.left +
                  (
                    index /
                    (
                      items.length -
                      1
                    )
                  ) *
                    PLOT_WIDTH;

            const y =
              MARGIN.top +
              PLOT_HEIGHT -
              (
                value /
                yMax
              ) *
                PLOT_HEIGHT;

            return {
              item,
              index,
              x,
              y,
              value,
            };
          },
        ),
      [
        items,
        metric,
        yMax,
      ],
    );

  const linePath =
    useMemo(
      () =>
        points
          .map(
            (
              point,
              index,
            ) =>
              `${index === 0
                ? "M"
                : "L"} ${point.x.toFixed(
                2,
              )} ${point.y.toFixed(
                2,
              )}`,
          )
          .join(
            " ",
          ),
      [
        points,
      ],
    );

  const areaPath =
    useMemo(
      () => {
        if (
          points.length ===
          0
        ) {
          return "";
        }

        const baselineY =
          MARGIN.top +
          PLOT_HEIGHT;

        return `${linePath} L ${points[
          points.length -
            1
        ].x.toFixed(
          2,
        )} ${baselineY.toFixed(
          2,
        )} L ${points[0].x.toFixed(
          2,
        )} ${baselineY.toFixed(
          2,
        )} Z`;
      },
      [
        linePath,
        points,
      ],
    );

  const xTickIndexes =
    useMemo(
      () =>
        buildTickIndexes(
          items.length,
        ),
      [
        items.length,
      ],
    );

  const peak =
    useMemo(
      () => {
        if (
          points.length ===
          0
        ) {
          return null;
        }

        return points.reduce(
          (
            currentPeak,
            point,
          ) =>
            point.value >
            currentPeak.value
              ? point
              : currentPeak,
          points[0],
        );
      },
      [
        points,
      ],
    );

  const currentSummaryValue =
    summaryMetricValue(
      summary,
      metric,
    );

  const hoveredPoint =
    hoveredIndex ===
      null
      ? null
      : points[
          hoveredIndex
        ] ??
        null;

  const averageValue =
    values.length >
    0
      ? values.reduce(
          (
            total,
            value,
          ) =>
            total +
            value,
          0,
        ) /
        values.length
      : 0;

  const peakVsAverage =
    peak &&
    averageValue >
      0
      ? (
          (
            peak.value -
            averageValue
          ) /
          averageValue
        ) *
        100
      : 0;

  const groupingLower =
    groupingLabel(
      grouping,
    ).toLocaleLowerCase(
      "pt-BR",
    );

  /* =======================================================
     OPÇÕES
  ======================================================= */

  const metricOptions:
    Array<{
      value:
        TimelineMetric;

      label:
        string;

      icon:
        typeof Activity;
    }> = [
      {
        value:
          "EVENTS",

        label:
          "Ocorrências",

        icon:
          Activity,
      },

      {
        value:
          "DOWNTIME",

        label:
          "Tempo de parada",

        icon:
          TimerReset,
      },

      {
        value:
          "MTTR",

        label:
          "MTTR",

        icon:
          Clock3,
      },
    ];

  const groupingOptions:
    Array<{
      value:
        TimelineGrouping;

      label:
        string;
    }> = [
      {
        value:
          "DAY",

        label:
          "Dia",
      },

      {
        value:
          "WEEK",

        label:
          "Semana",
      },

      {
        value:
          "MONTH",

        label:
          "Mês",
      },
    ];

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <section className="relative mt-5 overflow-hidden rounded-[28px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#E41E2B]/[0.035] blur-3xl" />

      {/* ===================================================
          HEADER
      ==================================================== */}

      <div className="relative border-b border-black/[0.05] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.035em] text-[#202327]">
              Evolução temporal
            </h2>

            <p className="mt-1 text-[10px] text-[#969BA1]">
              {metricDescription(
                metric,
              )}

              {line
                ? ` · ${line}`
                : ""}

              {equipment
                ? ` · ${equipment}`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {loading && (
              <div className="flex items-center gap-2 text-[9px] font-medium text-[#989DA3]">
                <LoaderCircle
                  size={12}
                  className="animate-spin text-[#E41E2B]"
                />

                Atualizando
              </div>
            )}

            <div className="inline-flex rounded-[11px] bg-[#F1F1F0] p-1">
              {metricOptions.map(
                (
                  option,
                ) => {
                  const Icon =
                    option.icon;

                  const active =
                    option.value ===
                    metric;

                  return (
                    <button
                      key={
                        option.value
                      }
                      type="button"
                      onClick={() =>
                        setMetric(
                          option.value,
                        )
                      }
                      className={[
                        "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[9px] font-semibold transition",
                        active
                          ? "bg-[#202327] text-white shadow-sm"
                          : "text-[#858A90] hover:bg-white hover:text-[#4D5258]",
                      ].join(
                        " ",
                      )}
                    >
                      <Icon
                        size={12}
                      />

                      {option.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-black/[0.045] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[9px] text-[#969BA1]">
            <CalendarDays
              size={12}
            />

            <span>
              {formatNumber(
                items.length,
              )}{" "}
              períodos analisados
            </span>
          </div>

          <div className="inline-flex w-fit rounded-[10px] bg-[#F3F3F2] p-1">
            {groupingOptions.map(
              (
                option,
              ) => {
                const active =
                  option.value ===
                  grouping;

                return (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    onClick={() =>
                      setGrouping(
                        option.value,
                      )
                    }
                    className={[
                      "relative h-8 rounded-[8px] px-3 text-[9px] font-semibold transition",
                      active
                        ? "bg-white text-[#25292D] shadow-sm"
                        : "text-[#8B9096] hover:text-[#555A60]",
                    ].join(
                      " ",
                    )}
                  >
                    {option.label}

                    {active && (
                      <span className="absolute bottom-[3px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
                    )}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          COMPARAÇÃO COM PERÍODO ANTERIOR
      ==================================================== */}

      {!error &&
        comparison && (
          <div className="relative border-b border-black/[0.045] bg-[#FAFAF9]">
            <div className="flex flex-col border-b border-black/[0.045] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#9DA2A8]">
                Comparativo com período anterior
              </p>

              <p className="mt-1 text-[8px] text-[#A1A5AA] sm:mt-0">
                {formatDatePtBr(
                  comparison
                    .previousStartDate,
                )}
                {" — "}
                {formatDatePtBr(
                  comparison
                    .previousEndDate,
                )}
              </p>
            </div>

            <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-black/[0.05]">
              <ComparisonMetric
                title="Ocorrências"
                value={
                  formatNumber(
                    comparison
                      .current
                      .events,
                  )
                }
                previousValue={
                  formatNumber(
                    comparison
                      .previous
                      .events,
                  )
                }
                variation={
                  comparison
                    .variation
                    .eventsPercentage
                }
              />

              <ComparisonMetric
                title="Tempo de parada"
                value={
                  formatMinutes(
                    comparison
                      .current
                      .downtimeMinutes,
                  )
                }
                previousValue={
                  formatMinutes(
                    comparison
                      .previous
                      .downtimeMinutes,
                  )
                }
                variation={
                  comparison
                    .variation
                    .downtimePercentage
                }
              />

              <ComparisonMetric
                title="MTTR"
                value={
                  formatMinutes(
                    comparison
                      .current
                      .mttr,
                  )
                }
                previousValue={
                  formatMinutes(
                    comparison
                      .previous
                      .mttr,
                  )
                }
                variation={
                  comparison
                    .variation
                    .mttrPercentage
                }
              />
            </div>
          </div>
        )}

      {/* ===================================================
          RESUMO DA MÉTRICA ATIVA
      ==================================================== */}

      {!error && (
        <div className="relative border-b border-black/[0.045] px-5 py-4 sm:px-6">
          <div className="grid gap-y-5 sm:grid-cols-3 sm:divide-x sm:divide-black/[0.055]">
            <div className="sm:pr-6">
              <div className="flex items-center gap-2 text-[#9DA2A8]">
                <TrendingUp
                  size={12}
                />

                <p className="text-[8px] font-semibold uppercase tracking-[0.11em]">
                  {metricTitle(
                    metric,
                  )}{" "}
                  no período
                </p>
              </div>

              <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.05em] text-[#202327]">
                {formatMetricValue(
                  currentSummaryValue,
                  metric,
                )}
              </p>
            </div>

            <div className="sm:px-6">
              <div className="flex items-center gap-2 text-[#9DA2A8]">
                <Activity
                  size={12}
                />

                <p className="text-[8px] font-semibold uppercase tracking-[0.11em]">
                  Pico
                </p>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-[24px] font-semibold leading-none tracking-[-0.05em] text-[#202327]">
                  {peak
                    ? formatMetricValue(
                        peak.value,
                        metric,
                      )
                    : "—"}
                </p>

                {peak &&
                  averageValue >
                    0 &&
                  peakVsAverage >
                    0 && (
                    <span className="rounded-full bg-[#FFF0F1] px-2 py-1 text-[8px] font-semibold text-[#C92832]">
                      +
                      {formatNumber(
                        peakVsAverage,
                        1,
                      )}
                      %
                    </span>
                  )}
              </div>

              <p className="mt-1.5 text-[8px] text-[#9DA2A8]">
                {peak
                  ? peak.item.label
                  : "Sem período disponível"}
              </p>
            </div>

            <div className="sm:pl-6">
              <div className="flex items-center gap-2 text-[#9DA2A8]">
                <Clock3
                  size={12}
                />

                <p className="text-[8px] font-semibold uppercase tracking-[0.11em]">
                  Média por{" "}
                  {groupingLower}
                </p>
              </div>

              <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.05em] text-[#202327]">
                {formatMetricValue(
                  averageValue,
                  metric,
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          ERROR
      ==================================================== */}

      {error && (
        <div className="px-6 py-8">
          <div className="rounded-[18px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-4 text-[11px] text-[#BF2C35]">
            {error}
          </div>
        </div>
      )}

      {/* ===================================================
          CHART
      ==================================================== */}

      {!error && (
        <div className="px-4 py-5 sm:px-6">
          {loading &&
          items.length ===
            0 ? (
            <div className="flex h-[350px] items-center justify-center">
              <LoaderCircle
                size={22}
                className="animate-spin text-[#E41E2B]"
              />
            </div>
          ) : items.length ===
            0 ? (
            <div className="flex h-[350px] flex-col items-center justify-center px-6 text-center">
              <Activity
                size={25}
                className="text-[#C4C7CA]"
              />

              <p className="mt-3 text-[12px] font-medium text-[#5F646A]">
                Nenhuma ocorrência encontrada no período
              </p>

              <p className="mt-1 max-w-[420px] text-[10px] leading-5 text-[#9A9FA5]">
                Ajuste o período, a linha ou o equipamento para visualizar a evolução temporal.
              </p>
            </div>
          ) : (
            <div
              className={[
                "relative rounded-[22px] border border-black/[0.045] bg-[#FCFCFB] px-2 pb-2 pt-4 transition-opacity duration-200 sm:px-4",
                loading
                  ? "opacity-55"
                  : "opacity-100",
              ].join(
                " ",
              )}
              onMouseLeave={() =>
                setHoveredIndex(
                  null,
                )
              }
            >
              <div className="mb-2 flex items-center justify-between gap-4 px-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#A0A5AA]">
                    Tendência
                  </p>

                  <p className="mt-1 text-[10px] text-[#7F848A]">
                    {metricTitle(
                      metric,
                    )}{" "}
                    por{" "}
                    {groupingLower}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[8px] font-medium text-[#989DA3]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-[2px] w-4 rounded-full bg-[#202327]" />

                    Tendência
                  </span>

                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#E41E2B]" />

                    Pico / foco
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="block h-auto w-full overflow-visible"
                role="img"
                aria-label={`${metricTitle(
                  metric,
                )} agrupado por ${groupingLower}`}
              >
                <defs>
                  <linearGradient
                    id="reliability-timeline-area"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#E41E2B"
                      stopOpacity="0.10"
                    />

                    <stop
                      offset="60%"
                      stopColor="#E41E2B"
                      stopOpacity="0.025"
                    />

                    <stop
                      offset="100%"
                      stopColor="#E41E2B"
                      stopOpacity="0"
                    />
                  </linearGradient>

                  <filter
                    id="reliability-timeline-focus-shadow"
                    x="-100%"
                    y="-100%"
                    width="300%"
                    height="300%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="2"
                      stdDeviation="3"
                      floodColor="#E41E2B"
                      floodOpacity="0.18"
                    />
                  </filter>
                </defs>

                {Array
                  .from({
                    length:
                      Y_GRID_LINES +
                      1,
                  })
                  .map(
                    (
                      _,
                      index,
                    ) => {
                      const ratio =
                        index /
                        Y_GRID_LINES;

                      const y =
                        MARGIN.top +
                        ratio *
                          PLOT_HEIGHT;

                      const value =
                        yMax *
                        (
                          1 -
                          ratio
                        );

                      return (
                        <g
                          key={`y-grid-${index}`}
                        >
                          <line
                            x1={
                              MARGIN.left
                            }
                            x2={
                              MARGIN.left +
                              PLOT_WIDTH
                            }
                            y1={
                              y
                            }
                            y2={
                              y
                            }
                            stroke="#ECEEEF"
                            strokeWidth="1"
                          />

                          <text
                            x={
                              MARGIN.left -
                              13
                            }
                            y={
                              y +
                              4
                            }
                            textAnchor="end"
                            fill="#9CA1A6"
                            fontSize="10"
                          >
                            {formatCompactNumber(
                              value,
                            )}
                          </text>
                        </g>
                      );
                    },
                  )}

                {areaPath && (
                  <path
                    d={
                      areaPath
                    }
                    fill="url(#reliability-timeline-area)"
                    stroke="none"
                  />
                )}

                {linePath && (
                  <path
                    d={
                      linePath
                    }
                    fill="none"
                    stroke="#25282C"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {xTickIndexes.map(
                  (
                    index,
                  ) => {
                    const point =
                      points[
                        index
                      ];

                    if (
                      !point
                    ) {
                      return null;
                    }

                    return (
                      <text
                        key={`x-label-${index}`}
                        x={
                          point.x
                        }
                        y={
                          MARGIN.top +
                          PLOT_HEIGHT +
                          31
                        }
                        textAnchor="middle"
                        fill="#92979C"
                        fontSize="10"
                      >
                        {point.item.label}
                      </text>
                    );
                  },
                )}

                {points.map(
                  (
                    point,
                  ) => {
                    const active =
                      hoveredIndex ===
                      point.index;

                    const isPeak =
                      peak?.index ===
                      point.index;

                    const emphasized =
                      active ||
                      isPeak;

                    return (
                      <g
                        key={`${point.item.periodStart}-${point.index}`}
                        onMouseEnter={() =>
                          setHoveredIndex(
                            point.index,
                          )
                        }
                        onFocus={() =>
                          setHoveredIndex(
                            point.index,
                          )
                        }
                        onBlur={() =>
                          setHoveredIndex(
                            null,
                          )
                        }
                        tabIndex={
                          0
                        }
                        role="button"
                        aria-label={`${point.item.label}: ${formatMetricValue(
                          point.value,
                          metric,
                        )}`}
                        className="outline-none"
                      >
                        <circle
                          cx={
                            point.x
                          }
                          cy={
                            point.y
                          }
                          r={
                            14
                          }
                          fill="transparent"
                        />

                        {active && (
                          <line
                            x1={
                              point.x
                            }
                            x2={
                              point.x
                            }
                            y1={
                              MARGIN.top
                            }
                            y2={
                              MARGIN.top +
                              PLOT_HEIGHT
                            }
                            stroke="#E41E2B"
                            strokeWidth="1"
                            strokeDasharray="4 5"
                            opacity="0.24"
                          />
                        )}

                        {(emphasized ||
                          points.length <=
                            55) && (
                          <circle
                            cx={
                              point.x
                            }
                            cy={
                              point.y
                            }
                            r={
                              emphasized
                                ? 5.5
                                : 3.25
                            }
                            fill={
                              emphasized
                                ? "#E41E2B"
                                : "#FFFFFF"
                            }
                            stroke={
                              emphasized
                                ? "#FFFFFF"
                                : "#25282C"
                            }
                            strokeWidth={
                              emphasized
                                ? 2.5
                                : 1.7
                            }
                            filter={
                              emphasized
                                ? "url(#reliability-timeline-focus-shadow)"
                                : undefined
                            }
                          />
                        )}

                        {isPeak &&
                          !active && (
                            <circle
                              cx={
                                point.x
                              }
                              cy={
                                point.y
                              }
                              r={
                                8.5
                              }
                              fill="none"
                              stroke="#E41E2B"
                              strokeWidth="1"
                              opacity="0.18"
                            />
                          )}
                      </g>
                    );
                  },
                )}
              </svg>

              {hoveredPoint && (
                <div
                  className="pointer-events-none absolute z-20 min-w-[205px] rounded-[16px] border border-white/[0.08] bg-[#202327] px-4 py-3.5 text-white shadow-[0_16px_40px_rgba(20,22,25,0.18)]"
                  style={{
                    left:
                      `${(
                        hoveredPoint.x /
                        CHART_WIDTH
                      ) *
                        100}%`,

                    top:
                      `${Math.max(
                        4,
                        (
                          hoveredPoint.y /
                          CHART_HEIGHT
                        ) *
                          100 -
                          18,
                      )}%`,

                    transform:
                      hoveredPoint.x >
                      CHART_WIDTH *
                        0.72
                        ? "translate(-100%, -100%)"
                        : "translate(10px, -100%)",
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[10px] font-semibold text-white/70">
                      {hoveredPoint.item.label}
                    </p>

                    {peak?.index ===
                      hoveredPoint.index && (
                      <span className="rounded-full bg-[#E41E2B] px-2 py-1 text-[7px] font-bold uppercase tracking-[0.09em] text-white">
                        Pico
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-[19px] font-semibold tracking-[-0.04em]">
                    {formatMetricValue(
                      hoveredPoint.value,
                      metric,
                    )}
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
                    <div>
                      <p className="text-[7px] uppercase tracking-[0.08em] text-white/35">
                        Ocorr.
                      </p>

                      <p className="mt-1 text-[9px] font-semibold text-white/75">
                        {formatNumber(
                          hoveredPoint
                            .item
                            .events,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[7px] uppercase tracking-[0.08em] text-white/35">
                        Parada
                      </p>

                      <p className="mt-1 text-[9px] font-semibold text-white/75">
                        {formatNumber(
                          hoveredPoint
                            .item
                            .downtimeMinutes,
                          1,
                        )}{" "}
                        min
                      </p>
                    </div>

                    <div>
                      <p className="text-[7px] uppercase tracking-[0.08em] text-white/35">
                        MTTR
                      </p>

                      <p className="mt-1 text-[9px] font-semibold text-white/75">
                        {formatNumber(
                          hoveredPoint
                            .item
                            .mttr,
                          1,
                        )}{" "}
                        min
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}