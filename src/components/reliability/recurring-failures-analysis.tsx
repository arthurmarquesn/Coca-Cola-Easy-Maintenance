"use client";

import {
  Activity,
  AlertTriangle,
  Clock3,
  LoaderCircle,
  Package,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type FailureMetric =
  | "OCCURRENCES"
  | "DOWNTIME";

interface FailureProductItem {
  code: string | null;
  description: string | null;
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  occurrencePercentage: number;
  downtimePercentage: number;
}

interface FailureItem {
  failureMode: string;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
  occurrencePercentage: number;
  downtimePercentage: number;
  products: FailureProductItem[];
  topProduct: FailureProductItem | null;
}

interface FailureSummary {
  totalEvents: number;
  classifiedEvents: number;
  unclassifiedEvents: number;
  classificationCoverage: number;
  failureModes: number;
  downtimeMinutes: number;
  classifiedDowntimeMinutes: number;
}

interface FailureResponse {
  success?: boolean;
  message?: string;
  summary?: Partial<FailureSummary>;
  items?: unknown[];
}

interface RecurringFailuresAnalysisProps {
  startDate?: string | null;
  endDate?: string | null;
  line?: string | null;
  equipment?: string | null;
}

function toNumber(
  value: unknown,
): number {
  const parsed = Number(
    value ?? 0,
  );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function safeText(
  value: unknown,
  fallback = "",
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
  value: number,
  maximumFractionDigits = 0,
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
  value: number,
): string {
  return `${formatNumber(
    value,
    1,
  )}%`;
}

function normalizeProduct(
  raw: unknown,
): FailureProductItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as Record<
      string,
      unknown
    >;

  const label =
    safeText(
      source.label,
      "Produto não informado",
    );

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

    label,

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
  raw: unknown,
): FailureItem | null {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const source =
    raw as Record<
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
            ): item is FailureProductItem =>
              item !==
              null,
          )
      : [];

  let topProduct:
    FailureProductItem | null =
    null;

  if (
    source.topProduct &&
    typeof source.topProduct ===
      "object"
  ) {
    topProduct =
      normalizeProduct(
        source.topProduct,
      );
  }

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

    topProduct:
      topProduct ??
      products[0] ??
      null,
  };
}

function metricValue(
  item: FailureItem,
  metric: FailureMetric,
): number {
  return metric ===
    "DOWNTIME"
    ? item.downtimeMinutes
    : item.occurrences;
}

function productMetricValue(
  item: FailureProductItem,
  metric: FailureMetric,
): number {
  return metric ===
    "DOWNTIME"
    ? item.downtimeMinutes
    : item.occurrences;
}

function productMetricPercentage(
  item: FailureProductItem,
  metric: FailureMetric,
): number {
  return metric ===
    "DOWNTIME"
    ? item.downtimePercentage
    : item.occurrencePercentage;
}

function metricValueLabel(
  value: number,
  metric: FailureMetric,
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

function SummaryMetric({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#A0A5AB]">
        {label}
      </p>

      <p
        className={
          `mt-2 text-[25px] font-semibold leading-none tracking-[-0.05em] ${
            warning
              ? "text-[#B4232C]"
              : "text-[#202327]"
          }`
        }
      >
        {value}
      </p>

      {detail && (
        <p className="mt-2 text-[9px] leading-4 text-[#9A9FA5]">
          {detail}
        </p>
      )}
    </div>
  );
}

export function RecurringFailuresAnalysis({
  startDate,
  endDate,
  line,
  equipment,
}: RecurringFailuresAnalysisProps) {
  const [
    metric,
    setMetric,
  ] =
    useState<FailureMetric>(
      "OCCURRENCES",
    );

  const [
    items,
    setItems,
  ] =
    useState<FailureItem[]>(
      [],
    );

  const [
    summary,
    setSummary,
  ] =
    useState<FailureSummary>({
      totalEvents: 0,
      classifiedEvents: 0,
      unclassifiedEvents: 0,
      classificationCoverage: 0,
      failureModes: 0,
      downtimeMinutes: 0,
      classifiedDowntimeMinutes: 0,
    });

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
      true,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      async function loadData() {
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
              `/api/analytics/reliability/failures?${params.toString()}`,
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
            FailureResponse =
            await response.json();

          if (
            !response.ok ||
            !raw.success
          ) {
            throw new Error(
              raw.message ??
                "Não foi possível carregar as falhas recorrentes.",
            );
          }

          const normalizedItems =
            Array.isArray(
              raw.items,
            )
              ? raw.items
                  .map(
                    normalizeFailure,
                  )
                  .filter(
                    (
                      item,
                    ): item is FailureItem =>
                      item !==
                      null,
                  )
              : [];

          setItems(
            normalizedItems,
          );

          setSummary({
            totalEvents:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.totalEvents,
                ),
              ),

            classifiedEvents:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.classifiedEvents,
                ),
              ),

            unclassifiedEvents:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.unclassifiedEvents,
                ),
              ),

            classificationCoverage:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.classificationCoverage,
                ),
              ),

            failureModes:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.failureModes,
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

            classifiedDowntimeMinutes:
              Math.max(
                0,
                toNumber(
                  raw.summary
                    ?.classifiedDowntimeMinutes,
                ),
              ),
          });

          setSelectedFailureMode(
            (
              current,
            ) => {
              if (
                current &&
                normalizedItems.some(
                  (
                    item,
                  ) =>
                    item.failureMode ===
                    current,
                )
              ) {
                return current;
              }

              return normalizedItems[0]
                ?.failureMode ??
                null;
            },
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

          setItems(
            [],
          );

          setSelectedFailureMode(
            null,
          );

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "Não foi possível carregar as falhas recorrentes.",
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

      void loadData();

      return () => {
        controller.abort();
      };
    },
    [
      startDate,
      endDate,
      line,
      equipment,
    ],
  );

  const sortedItems =
    useMemo(
      () =>
        [
          ...items,
        ].sort(
          (
            a,
            b,
          ) => {
            const difference =
              metricValue(
                b,
                metric,
              ) -
              metricValue(
                a,
                metric,
              );

            if (
              difference !==
              0
            ) {
              return difference;
            }

            return a.failureMode
              .localeCompare(
                b.failureMode,
                "pt-BR",
              );
          },
        ),
      [
        items,
        metric,
      ],
    );

  const visibleItems =
    sortedItems.slice(
      0,
      10,
    );

  const maxValue =
    Math.max(
      1,
      ...visibleItems.map(
        (
          item,
        ) =>
          metricValue(
            item,
            metric,
          ),
      ),
    );

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (
            item,
          ) =>
            item.failureMode ===
            selectedFailureMode,
        ) ??
        sortedItems[0] ??
        null,
      [
        items,
        sortedItems,
        selectedFailureMode,
      ],
    );

  const selectedRank =
    useMemo(
      () => {
        if (
          !selectedItem
        ) {
          return 0;
        }

        const index =
          sortedItems.findIndex(
            (
              item,
            ) =>
              item.failureMode ===
              selectedItem.failureMode,
          );

        return index >=
          0
          ? index + 1
          : 0;
      },
      [
        sortedItems,
        selectedItem,
      ],
    );

  const selectedProducts =
    useMemo(
      () => {
        if (
          !selectedItem
        ) {
          return [];
        }

        return [
          ...selectedItem.products,
        ]
          .sort(
            (
              a,
              b,
            ) => {
              const difference =
                productMetricValue(
                  b,
                  metric,
                ) -
                productMetricValue(
                  a,
                  metric,
                );

              if (
                difference !==
                0
              ) {
                return difference;
              }

              return a.label
                .localeCompare(
                  b.label,
                  "pt-BR",
                );
            },
          )
          .slice(
            0,
            5,
          );
      },
      [
        selectedItem,
        metric,
      ],
    );

  const maxProductValue =
    Math.max(
      1,
      ...selectedProducts.map(
        (
          item,
        ) =>
          productMetricValue(
            item,
            metric,
          ),
      ),
    );

  const classifiedShare =
    Math.min(
      100,
      Math.max(
        0,
        summary.classificationCoverage,
      ),
    );

  return (
    <section className="relative mt-6 overflow-hidden rounded-[30px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#E41E2B]/[0.035] blur-3xl" />

      {/* ===================================================
          HEADER
      ==================================================== */}

      <div className="relative border-b border-black/[0.05] px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative flex h-8 min-w-8 items-center justify-center rounded-full bg-[#202327] px-2 text-[10px] font-bold text-white shadow-[0_5px_14px_rgba(32,35,39,0.12)]">
              05

              <span className="absolute -bottom-[2px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-[#E41E2B]" />
            </div>

            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#24272B]">
                Falhas mais recorrentes
              </h2>

              <p className="mt-1 max-w-[620px] text-[11px] leading-5 text-[#969BA1]">
                Modos de falha consolidados e sua associação com o produto registrado no momento da ocorrência.
              </p>
            </div>
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

            <div className="inline-flex rounded-full bg-[#F1F1F0] p-1">
              <button
                type="button"
                onClick={() =>
                  setMetric(
                    "OCCURRENCES",
                  )
                }
                className={
                  `inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[9px] font-semibold transition-all duration-200 ${
                    metric ===
                    "OCCURRENCES"
                      ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.13)]"
                      : "text-[#858A90] hover:bg-white hover:text-[#4D5258]"
                  }`
                }
              >
                <Activity
                  size={12}
                />

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
                  `inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[9px] font-semibold transition-all duration-200 ${
                    metric ===
                    "DOWNTIME"
                      ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.13)]"
                      : "text-[#858A90] hover:bg-white hover:text-[#4D5258]"
                  }`
                }
              >
                <Clock3
                  size={12}
                />

                Tempo de parada
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================
          SUMMARY
      ==================================================== */}

      {!error && (
        <div className="relative border-b border-black/[0.045] bg-[#FAFAF9] px-6 py-5 sm:px-8">
          <div className="grid gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
            <div className="xl:border-r xl:border-black/[0.06] xl:pr-7">
              <SummaryMetric
                label="Falhas classificadas"
                value={formatNumber(
                  summary.classifiedEvents,
                )}
                detail={`${formatNumber(
                  summary.totalEvents,
                )} eventos no recorte`}
              />
            </div>

            <div className="xl:border-r xl:border-black/[0.06] xl:px-7">
              <SummaryMetric
                label="Modos encontrados"
                value={formatNumber(
                  summary.failureModes,
                )}
                detail="modos de falha distintos"
              />
            </div>

            <div className="xl:border-r xl:border-black/[0.06] xl:px-7">
              <SummaryMetric
                label="Cobertura"
                value={formatPercentage(
                  summary.classificationCoverage,
                )}
                detail="dos eventos classificados"
              />
            </div>

            <div className="xl:pl-7">
              <SummaryMetric
                label="Não classificados"
                value={formatNumber(
                  summary.unclassifiedEvents,
                )}
                detail={
                  summary.unclassifiedEvents >
                  0
                    ? "aguardando classificação"
                    : "nenhuma pendência"
                }
                warning={
                  summary.unclassifiedEvents >
                  0
                }
              />
            </div>
          </div>

          <div className="mt-5 h-[4px] overflow-hidden rounded-full bg-[#E5E7E8]">
            <div
              className="h-full rounded-full bg-[#202327] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width:
                  `${classifiedShare}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ===================================================
          ERROR
      ==================================================== */}

      {error && (
        <div className="px-6 py-8 sm:px-8">
          <div className="flex gap-3 rounded-[18px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-4">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-[#BF2C35]"
            />

            <p className="text-[11px] leading-5 text-[#BF2C35]">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* ===================================================
          CONTENT
      ==================================================== */}

      {!error && (
        <>
          {loading &&
          items.length ===
            0 ? (
            <div className="flex min-h-[430px] items-center justify-center">
              <LoaderCircle
                size={22}
                className="animate-spin text-[#E41E2B]"
              />
            </div>
          ) : items.length ===
            0 ? (
            <div className="flex min-h-[430px] flex-col items-center justify-center px-6 text-center">
              <Activity
                size={26}
                className="text-[#C3C6C9]"
              />

              <p className="mt-3 text-[12px] font-medium text-[#5F646A]">
                Nenhuma falha classificada encontrada
              </p>

              <p className="mt-1 max-w-[420px] text-[10px] leading-5 text-[#9A9FA5]">
                Ajuste os filtros ou verifique se os eventos do período já foram classificados.
              </p>
            </div>
          ) : (
            <div
              className={
                `grid transition-opacity duration-200 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] ${
                  loading
                    ? "opacity-60"
                    : "opacity-100"
                }`
              }
            >
              {/* ===========================================
                  RANKING
              ============================================ */}

              <div className="border-b border-black/[0.045] px-6 py-7 sm:px-8 lg:border-b-0 lg:border-r">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A2A6AB]">
                      Ranking
                    </p>

                    <p className="mt-1.5 text-[12px] font-medium text-[#41464B]">
                      {metric ===
                      "OCCURRENCES"
                        ? "Falhas que mais se repetem"
                        : "Falhas que mais consomem tempo"}
                    </p>
                  </div>

                  <p className="hidden text-[9px] text-[#AAAFB4] sm:block">
                    Selecione uma falha
                  </p>
                </div>

                <div className="mt-5 space-y-1">
                  {visibleItems.map(
                    (
                      item,
                      index,
                    ) => {
                      const value =
                        metricValue(
                          item,
                          metric,
                        );

                      const width =
                        Math.max(
                          3,
                          (
                            value /
                            maxValue
                          ) *
                            100,
                        );

                      const selected =
                        selectedItem
                          ?.failureMode ===
                        item.failureMode;

                      return (
                        <button
                          key={
                            item.failureMode
                          }
                          type="button"
                          onClick={() =>
                            setSelectedFailureMode(
                              item.failureMode,
                            )
                          }
                          className={
                            `group w-full rounded-[18px] border px-4 py-4 text-left transition-all duration-200 ${
                              selected
                                ? "border-[#E9C5C8] bg-[#FFF8F8]"
                                : "border-transparent hover:border-black/[0.045] hover:bg-[#FAFAF9]"
                            }`
                          }
                        >
                          <div className="flex items-start justify-between gap-5">
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={
                                  `mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-200 ${
                                    selected
                                      ? "bg-[#E41E2B] text-white shadow-[0_4px_10px_rgba(228,30,43,0.14)]"
                                      : "bg-[#F0F1F1] text-[#70757B]"
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

                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold leading-5 text-[#2B2F33]">
                                  {item.failureMode}
                                </p>

                                {item.topProduct && (
                                  <p className="mt-0.5 truncate text-[9px] text-[#9DA2A8]">
                                    Produto mais associado: {item.topProduct.label}
                                  </p>
                                )}
                              </div>
                            </div>

                            <p className="shrink-0 text-[10px] font-semibold tabular-nums text-[#34383D]">
                              {metricValueLabel(
                                value,
                                metric,
                              )}
                            </p>
                          </div>

                          <div className="mt-3.5 h-[4px] overflow-hidden rounded-full bg-[#ECEDEC]">
                            <div
                              className={
                                `h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                  selected
                                    ? "bg-[#E41E2B]"
                                    : "bg-[#41464B]"
                                }`
                              }
                              style={{
                                width:
                                  `${width}%`,
                              }}
                            />
                          </div>

                          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#9A9FA5]">
                            <span>
                              {formatNumber(
                                item.occurrences,
                              )}{" "}
                              ocorrências
                            </span>

                            <span>
                              {formatNumber(
                                item.downtimeMinutes,
                                1,
                              )}{" "}
                              min
                            </span>

                            <span>
                              MTTR{" "}
                              {formatNumber(
                                item.mttr,
                                1,
                              )}{" "}
                              min
                            </span>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>

                {items.length >
                  10 && (
                  <p className="mt-5 text-center text-[9px] text-[#A0A4A9]">
                    Exibindo as 10 principais de{" "}
                    {formatNumber(
                      items.length,
                    )}{" "}
                    falhas classificadas.
                  </p>
                )}
              </div>

              {/* ===========================================
                  FOCUS
              ============================================ */}

              <div className="bg-[#FCFCFB] px-6 py-7 sm:px-8">
                {selectedItem && (
                  <>
                    <div className="relative overflow-hidden rounded-[26px] bg-[#202327] p-6 text-white shadow-[0_14px_36px_rgba(32,35,39,0.12)]">
                      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[#E41E2B]/[0.10] blur-3xl" />

                      <div className="relative">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
                              Falha selecionada
                            </p>

                            <h3 className="mt-2 max-w-[420px] text-[18px] font-semibold leading-6 tracking-[-0.03em] text-white">
                              {selectedItem.failureMode}
                            </h3>
                          </div>

                          {selectedRank >
                            0 && (
                            <div className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[9px] font-semibold text-white/65">
                              #{String(
                                selectedRank,
                              ).padStart(
                                2,
                                "0",
                              )}
                            </div>
                          )}
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[8px] font-medium text-white/38">
                              Ocorrências
                            </p>

                            <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em]">
                              {formatNumber(
                                selectedItem.occurrences,
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[8px] font-medium text-white/38">
                              Parada
                            </p>

                            <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em]">
                              {formatNumber(
                                selectedItem.downtimeMinutes,
                                1,
                              )}

                              <span className="ml-1 text-[9px] font-medium tracking-normal text-white/38">
                                min
                              </span>
                            </p>
                          </div>

                          <div>
                            <p className="text-[8px] font-medium text-white/38">
                              MTTR
                            </p>

                            <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em]">
                              {formatNumber(
                                selectedItem.mttr,
                                1,
                              )}

                              <span className="ml-1 text-[9px] font-medium tracking-normal text-white/38">
                                min
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* =======================================
                        PRODUCTS
                    ======================================== */}

                    <div className="mt-6 flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[#EFEFEE] text-[#565B61]">
                        <Package
                          size={14}
                        />
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-[#34383D]">
                          Produto durante a ocorrência
                        </p>

                        <p className="mt-1 text-[9px] leading-4 text-[#9A9FA5]">
                          Produtos registrados nos eventos associados a esta falha.
                        </p>
                      </div>
                    </div>

                    {selectedProducts.length >
                    0 ? (
                      <div className="mt-5">
                        {selectedProducts.map(
                          (
                            product,
                            index,
                          ) => {
                            const value =
                              productMetricValue(
                                product,
                                metric,
                              );

                            const percentage =
                              productMetricPercentage(
                                product,
                                metric,
                              );

                            const width =
                              Math.max(
                                3,
                                (
                                  value /
                                  maxProductValue
                                ) *
                                  100,
                              );

                            return (
                              <div
                                key={
                                  `${product.label}-${index}`
                                }
                                className={
                                  index ===
                                    0
                                    ? "pb-5"
                                    : "border-t border-black/[0.045] py-5"
                                }
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F0F1F1] text-[8px] font-bold text-[#71767C]">
                                        {String(
                                          index +
                                            1,
                                        ).padStart(
                                          2,
                                          "0",
                                        )}
                                      </span>

                                      <p className="truncate text-[10px] font-semibold text-[#373B40]">
                                        {product.label}
                                      </p>
                                    </div>

                                    <p className="ml-8 mt-1 text-[8px] text-[#A0A4A9]">
                                      {formatPercentage(
                                        percentage,
                                      )}{" "}
                                      da falha selecionada
                                    </p>
                                  </div>

                                  <p className="shrink-0 text-[10px] font-semibold tabular-nums text-[#3A3E42]">
                                    {metricValueLabel(
                                      value,
                                      metric,
                                    )}
                                  </p>
                                </div>

                                <div className="ml-8 mt-3 h-[4px] overflow-hidden rounded-full bg-[#E8EAEB]">
                                  <div
                                    className={
                                      `h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                        index ===
                                        0
                                          ? "bg-[#E41E2B]"
                                          : "bg-[#41464B]"
                                      }`
                                    }
                                    style={{
                                      width:
                                        `${width}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[18px] border border-dashed border-[#DDE0E2] bg-white px-4 py-6 text-center">
                        <Package
                          size={18}
                          className="mx-auto text-[#B2B6BA]"
                        />

                        <p className="mt-2 text-[10px] font-medium text-[#777C82]">
                          Produto não identificado
                        </p>

                        <p className="mt-1 text-[9px] leading-4 text-[#A0A4A9]">
                          Não há informação de material suficiente para este recorte.
                        </p>
                      </div>
                    )}

                    <div className="mt-2 border-t border-black/[0.045] pt-4">
                      <p className="text-[9px] leading-4 text-[#9DA1A6]">
                        A associação mostra qual produto estava registrado no evento da falha. Ela não estabelece, isoladamente, relação de causa.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}