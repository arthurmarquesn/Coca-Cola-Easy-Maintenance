"use client";

import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import {
  ArrowLeft,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

interface ReliabilityPageProps {
  user: {
    name: string;
  };

  unit: {
    city:
      | string
      | null;
  };
}

interface ParetoItem {
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  percentage: number;
  cumulativePercentage: number;
}

type Quadrant =
  | "CRITICO"
  | "CRITICO_CRONICO"
  | "CONFORTO"
  | "CRONICO";

interface JackKnifeItem {
  label: string;
  failures: number;
  downtimeMinutes: number;
  mttr: number;
  quadrant: Quadrant;
}

interface ReliabilityData {
  analysisLevel:
    | "EQUIPMENT"
    | "FAILURE_MODE";

  filters: {
    startDate:
      | string
      | null;

    endDate:
      | string
      | null;

    line:
      | string
      | null;

    equipment:
      | string
      | null;

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

  pareto:
    ParetoItem[];

  jackKnife:
    JackKnifeItem[];

  jackKnifeLimits: {
    failures: number;
    mttr: number;
  };
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/* =========================================================
   HELPERS
========================================================= */

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
  maximumFractionDigits = 0,
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits,
    },
  ).format(
    value,
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
      maxLength -
        1,
    ),
  )}…`;
}

function quadrantColor(
  quadrant: Quadrant,
) {
  switch (
    quadrant
  ) {
    case "CRITICO_CRONICO":
      return "#E41E2B";

    case "CRITICO":
      return "#E3A52F";

    case "CRONICO":
      return "#4E9ED7";

    case "CONFORTO":
    default:
      return "#62A96B";
  }
}

/* =========================================================
   TOOLTIP
========================================================= */

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

/* =========================================================
   PARETO
========================================================= */

function ParetoChart({
  items,
}: {
  items:
    ParetoItem[];
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
      <div className="flex min-h-[380px] items-center justify-center text-[13px] text-[#93989E]">
        Não há dados para o período selecionado.
      </div>
    );
  }

  const width =
    1100;

  const height =
    430;

  const left =
    66;

  const right =
    58;

  const top =
    34;

  const bottom =
    112;

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
          item.downtimeMinutes,
      ),
      1,
    );

  const slotWidth =
    plotWidth /
    items.length;

  const barWidth =
    Math.min(
      66,
      slotWidth *
        0.64,
    );

  const pointCoordinates =
    items.map(
      (
        item,
        index,
      ) => {
        const x =
          left +
          slotWidth *
            index +
          slotWidth /
            2;

        const y =
          top +
          plotHeight -
          (
            item.cumulativePercentage /
            100
          ) *
            plotHeight;

        return {
          x,
          y,
        };
      },
    );

  const linePath =
    pointCoordinates
      .map(
        (
          point,
          index,
        ) =>
          `${
            index ===
            0
              ? "M"
              : "L"
          } ${point.x} ${point.y}`,
      )
      .join(
        " ",
      );

  const eightyY =
    top +
    plotHeight -
    0.8 *
      plotHeight;

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
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Gráfico de Pareto do tempo de parada"
        onMouseMove={(
          event,
        ) => {
          if (!tooltip) {
            return;
          }

          const rect =
            event.currentTarget.getBoundingClientRect();

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
        {/* grid */}

        {[0, 0.5, 1].map(
          (
            fraction,
          ) => {
            const y =
              top +
              plotHeight -
              fraction *
                plotHeight;

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
                  stroke="#ECEDEF"
                  strokeWidth="1"
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
                  fontSize="11"
                  fill="#9A9EA3"
                >
                  {formatNumber(
                    maxDowntime *
                      fraction,
                  )}
                </text>
              </g>
            );
          },
        )}

        {/* 80% */}

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
          strokeDasharray="8 7"
        />

        <text
          x={
            width -
            right
          }
          y={
            eightyY -
            8
          }
          textAnchor="end"
          fontSize="11"
          fill="#A68424"
        >
          80%
        </text>

        {/* barras */}

        {items.map(
          (
            item,
            index,
          ) => {
            const barHeight =
              (
                item.downtimeMinutes /
                maxDowntime
              ) *
              plotHeight;

            const x =
              left +
              slotWidth *
                index +
              (
                slotWidth -
                barWidth
              ) /
                2;

            const y =
              top +
              plotHeight -
              barHeight;

            const centerX =
              x +
              barWidth /
                2;

            return (
              <g
                key={
                  `${item.label}-${index}`
                }
                onMouseEnter={() =>
                  setTooltip({
                    x:
                      centerX,

                    y,

                    title:
                      item.label,

                    lines: [
                      `${formatNumber(
                        item.downtimeMinutes,
                        1,
                      )} min de parada`,

                      `${formatNumber(
                        item.occurrences,
                      )} ocorrências`,

                      `${formatNumber(
                        item.cumulativePercentage,
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
                    barHeight
                  }
                  rx="4"
                  fill="#E41E2B"
                  className="transition-opacity hover:opacity-80"
                />

                <text
                  x={
                    centerX
                  }
                  y={
                    top +
                    plotHeight +
                    22
                  }
                  textAnchor="end"
                  transform={`rotate(-35 ${centerX} ${
                    top +
                    plotHeight +
                    22
                  })`}
                  fontSize="10"
                  fill="#777C82"
                >
                  {truncate(
                    item.label,
                    22,
                  )}
                </text>
              </g>
            );
          },
        )}

        {/* linha acumulada */}

        <path
          d={
            linePath
          }
          fill="none"
          stroke="#25282C"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {pointCoordinates.map(
          (
            point,
            index,
          ) => (
            <circle
              key={
                `point-${index}`
              }
              cx={
                point.x
              }
              cy={
                point.y
              }
              r="4"
              fill="#25282C"
            />
          ),
        )}

        {/* eixos */}

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
          y="18"
          fontSize="11"
          fill="#92979D"
        >
          Minutos
        </text>

        <text
          x={
            width -
            right
          }
          y="18"
          textAnchor="end"
          fontSize="11"
          fill="#92979D"
        >
          % acumulado
        </text>
      </svg>
    </div>
  );
}

/* =========================================================
   JACK-KNIFE
========================================================= */

function JackKnifeChart({
  items,
  failuresLimit,
  mttrLimit,
}: {
  items:
    JackKnifeItem[];

  failuresLimit: number;

  mttrLimit: number;
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
      <div className="flex min-h-[430px] items-center justify-center text-[13px] text-[#93989E]">
        Não há dados para o período selecionado.
      </div>
    );
  }

  const width =
    1100;

  const height =
    470;

  const left =
    72;

  const right =
    42;

  const top =
    42;

  const bottom =
    64;

  const plotWidth =
    width -
    left -
    right;

  const plotHeight =
    height -
    top -
    bottom;

  const maxFailures =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          item.failures,
      ),
      failuresLimit,
      1,
    );

  const maxMttr =
    Math.max(
      ...items.map(
        (
          item,
        ) =>
          item.mttr,
      ),
      mttrLimit,
      1,
    );

  /*
    Frequência em escala logarítmica.
    log(1 + n) preserva o zero e evita esmagar
    equipamentos com poucas ocorrências.
  */

  const maxLog =
    Math.log1p(
      maxFailures,
    );

  function xFor(
    failures: number,
  ) {
    return (
      left +
      (
        Math.log1p(
          Math.max(
            0,
            failures,
          ),
        ) /
        maxLog
      ) *
        plotWidth
    );
  }

  function yFor(
    mttr: number,
  ) {
    return (
      top +
      plotHeight -
      (
        Math.max(
          0,
          mttr,
        ) /
        maxMttr
      ) *
        plotHeight
    );
  }

  const dividerX =
    xFor(
      failuresLimit,
    );

  const dividerY =
    yFor(
      mttrLimit,
    );

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
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Gráfico Jack-Knife de frequência por MTTR"
        onMouseMove={(
          event,
        ) => {
          if (!tooltip) {
            return;
          }

          const rect =
            event.currentTarget.getBoundingClientRect();

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
        {/* áreas suaves */}

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
          fill="#FFF9EC"
        />

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
          fill="#FFF4F4"
        />

        {/* divisores */}

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
          stroke="#8E9399"
          strokeWidth="2"
          strokeDasharray="8 7"
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
          stroke="#8E9399"
          strokeWidth="2"
          strokeDasharray="8 7"
        />

        {/* quadrantes */}

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
          fill="#A18A4A"
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
          fill="#C75E64"
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
          fill="#729078"
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
          fill="#668CAD"
        >
          Crônico
        </text>

        {/* pontos */}

        {items.map(
          (
            item,
            index,
          ) => {
            const x =
              xFor(
                item.failures,
              );

            const y =
              yFor(
                item.mttr,
              );

            const radius =
              Math.min(
                17,
                Math.max(
                  7,
                  6 +
                    Math.sqrt(
                      item.downtimeMinutes,
                    ) *
                      0.22,
                ),
              );

            return (
              <circle
                key={
                  `${item.label}-${index}`
                }
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
                  quadrantColor(
                    item.quadrant,
                  )
                }
                fillOpacity="0.9"
                stroke="white"
                strokeWidth="2"
                className="cursor-default transition-opacity hover:opacity-75"
                onMouseEnter={() =>
                  setTooltip({
                    x,
                    y,

                    title:
                      item.label,

                    lines: [
                      `${formatNumber(
                        item.failures,
                      )} falhas`,

                      `MTTR ${formatNumber(
                        item.mttr,
                        1,
                      )} min`,

                      `${formatNumber(
                        item.downtimeMinutes,
                        1,
                      )} min de parada`,
                    ],
                  })
                }
              />
            );
          },
        )}

        {/* eixos */}

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
          fill="#92979D"
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
          fill="#92979D"
        >
          Número de falhas · escala log
        </text>

        <text
          x={
            dividerX +
            8
          }
          y={
            top +
            plotHeight +
            22
          }
          fontSize="10"
          fill="#969BA1"
        >
          média {formatNumber(
            failuresLimit,
            1,
          )}
        </text>

        <text
          x={
            left -
            10
          }
          y={
            dividerY -
            7
          }
          textAnchor="end"
          fontSize="10"
          fill="#969BA1"
        >
          {formatNumber(
            mttrLimit,
            1,
          )}
        </text>
      </svg>
    </div>
  );
}

/* =========================================================
   PÁGINA
========================================================= */

export function ReliabilityPage({
  user,
  unit,
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
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

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

          if (line) {
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

          const json =
            await response.json();

          if (
            !response.ok ||
            !json.success
          ) {
            throw new Error(
              json.message ??
                "Não foi possível carregar os dados.",
            );
          }

          setData(
            json,
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
            !signal?.aborted
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

    void loadData(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [
    loadData,
  ]);

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
  }

  const analysisLabel =
    data?.analysisLevel ===
    "FAILURE_MODE"
      ? "falha"
      : "equipamento";

  const lines =
    data?.filters.options
      .lines ??
    [];

  const equipments =
    data?.filters.options
      .equipments ??
    [];

  return (
    <main className="min-h-screen bg-background-secondary transition-colors">
      <header className="border-b border-border-theme bg-surface transition-colors">
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

          <div className="flex items-center gap-5">
            <ThemeSwitcher />
            <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-text-primary">
              {user.name}
            </p>

            {unit.city && (
              -text-body">
                {unit.city}
              </p>
            )}
          </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-10 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

        <div className="mt-9">
          -text-title sm:text-[40px]">
            Confiabilidade
          </h1>
        </div>

        {/* =================================================
            FILTROS
        ================================================== */}

        <section className="mt-8 grid gap-4 border-y border-border-theme py-5 md:grid-cols-2 xl:grid-cols-[180px_180px_1fr_1fr_auto]">
          <label className="block">
            -text-body">
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
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface-elevated px-3 text-[12px] text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-2 focus:ring-[var(--focus-ring)] [color-scheme:dark] dark:[color-scheme:dark]"
            />
          </label>

          <label className="block">
            -text-body">
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
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface-elevated px-3 text-[12px] text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-2 focus:ring-[var(--focus-ring)] [color-scheme:dark] dark:[color-scheme:dark]"
            />
          </label>

          <label className="block">
            -text-body">
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
                  event.target
                    .value,
                );

                setEquipment(
                  "",
                );
              }}
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface-elevated px-3 text-[12px] text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-2 focus:ring-[var(--focus-ring)] [color-scheme:dark] dark:[color-scheme:dark]"
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
            -text-body">
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
                  event.target
                    .value,
                )
              }
              className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface-elevated px-3 text-[12px] text-text-primary outline-none transition-colors focus:border-accent-primary focus:ring-2 focus:ring-[var(--focus-ring)] [color-scheme:dark] dark:[color-scheme:dark]"
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
              className="flex h-11 items-center gap-2 px-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-accent-primary"
            >
              <RotateCcw
                size={15}
              />

              Limpar
            </button>
          </div>
        </section>

        {/* =================================================
            ESTADO
        ================================================== */}

        {error && (
          <div className="mt-8 rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[12px] text-[#BF2C35]">
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
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-[#888D93]">
                {formatNumber(
                  data.summary
                    .events,
                )}{" "}
                ocorrências
                {" · "}
                {formatNumber(
                  data.summary
                    .downtimeMinutes,
                  1,
                )}{" "}
                min de parada
              </p>

              {loading && (
                <LoaderCircle
                  size={16}
                  className="animate-spin text-[#E41E2B]"
                />
              )}
            </div>

            {/* =============================================
                PARETO
            ============================================== */}

            <section className="mt-5 overflow-hidden rounded-[24px] border border-[#E5E7E9] bg-background-primary transition-colors">
              <div className="flex items-center justify-between border-b border-[#ECEDEF] px-6 py-5">
                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[#24272B]">
                    Pareto de tempo de parada
                  </h2>

                  <p className="mt-1 text-[11px] text-[#979CA2]">
                    Por{" "}
                    {
                      analysisLabel
                    }
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <ParetoChart
                  items={
                    data.pareto
                  }
                />
              </div>
            </section>

            {/* =============================================
                JACK-KNIFE
            ============================================== */}

            <section className="mt-6 overflow-hidden rounded-[24px] border border-[#E5E7E9] bg-background-primary transition-colors">
              <div className="flex items-center justify-between border-b border-[#ECEDEF] px-6 py-5">
                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[#24272B]">
                    Jack-Knife
                  </h2>

                  <p className="mt-1 text-[11px] text-[#979CA2]">
                    Frequência × MTTR por{" "}
                    {
                      analysisLabel
                    }
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <JackKnifeChart
                  items={
                    data.jackKnife
                  }
                  failuresLimit={
                    data
                      .jackKnifeLimits
                      .failures
                  }
                  mttrLimit={
                    data
                      .jackKnifeLimits
                      .mttr
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
