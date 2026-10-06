"use client";

import {
  AlertCircle,
  ArrowUpRight,
  Factory,
  Gauge,
  LoaderCircle,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";


/* =========================================================
   TYPES
========================================================= */

type LineMetric =
  | "DOWNTIME"
  | "OCCURRENCES"
  | "MTTR";


interface LineImpactAnalysisProps {
  startDate?: string | null;
  endDate?: string | null;
  line?: string | null;
  equipment?: string | null;

  onOpenEquipmentHistory?: (
    equipmentName: string,
    lineName: string,
  ) => void;
}


interface OriginMetric {
  occurrences: number;
  downtimeMinutes: number;
  occurrencePercentage: number;
  downtimePercentage: number;
}


interface LineOrigin {
  operation: OriginMetric;
  maintenance: OriginMetric;
  unclassified: OriginMetric;
}


interface EquipmentImpactItem {
  name: string;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
}


interface LineImpactItem {
  line: string;

  occurrences: number;
  downtimeMinutes: number;
  mttr: number;

  occurrencePercentage: number;
  downtimePercentage: number;

  origin: LineOrigin;

  topEquipment:
    EquipmentImpactItem | null;

  equipments:
    EquipmentImpactItem[];
}


interface LineImpactSummary {
  lines: number;
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
}


interface LineImpactResponse {
  success: boolean;

  summary: LineImpactSummary;

  items: LineImpactItem[];
}


/* =========================================================
   CONSTANTS
========================================================= */

const API_ENDPOINT =
  "/api/analytics/reliability/lines";


const METRIC_OPTIONS: Array<{
  id: LineMetric;
  label: string;
}> = [
  {
    id:
      "DOWNTIME",

    label:
      "Tempo de parada",
  },

  {
    id:
      "OCCURRENCES",

    label:
      "Ocorrências",
  },

  {
    id:
      "MTTR",

    label:
      "MTTR",
  },
];


/* =========================================================
   NORMALIZATION
========================================================= */

function asRecord(
  value: unknown,
): Record<
  string,
  unknown
> {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return {};
  }

  return value as Record<
    string,
    unknown
  >;
}


function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}


function safeString(
  value: unknown,
  fallback = "",
): string {
  if (
    typeof value !==
    "string"
  ) {
    return fallback;
  }

  const normalized =
    value.trim();

  return (
    normalized ||
    fallback
  );
}


function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const trimmed =
      value.trim();

    if (
      !trimmed
    ) {
      return fallback;
    }

    const normalized =
      trimmed.includes(",")
        ? trimmed
          .replace(
            /\./g,
            "",
          )
          .replace(
            ",",
            ".",
          )
        : trimmed;

    const parsed =
      Number(
        normalized,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return fallback;
}


function normalizeOriginMetric(
  value: unknown,
): OriginMetric {
  const source =
    asRecord(
      value,
    );

  return {
    occurrences:
      safeNumber(
        source.occurrences,
        0,
      ),

    downtimeMinutes:
      safeNumber(
        source.downtimeMinutes,
        0,
      ),

    occurrencePercentage:
      safeNumber(
        source.occurrencePercentage,
        0,
      ),

    downtimePercentage:
      safeNumber(
        source.downtimePercentage,
        0,
      ),
  };
}


function normalizeEquipment(
  value: unknown,
): EquipmentImpactItem {
  const source =
    asRecord(
      value,
    );

  const occurrences =
    safeNumber(
      source.occurrences,
      0,
    );

  const downtimeMinutes =
    safeNumber(
      source.downtimeMinutes,
      0,
    );

  const mttrFromApi =
    safeNumber(
      source.mttr,
      Number.NaN,
    );

  return {
    name:
      safeString(
        source.name,
        "Equipamento não informado",
      ),

    occurrences,

    downtimeMinutes,

    mttr:
      Number.isFinite(
        mttrFromApi,
      )
        ? mttrFromApi
        : occurrences > 0
          ? downtimeMinutes /
            occurrences
          : 0,
  };
}


function normalizeLineItem(
  value: unknown,
): LineImpactItem {
  const source =
    asRecord(
      value,
    );

  const originRaw =
    asRecord(
      source.origin,
    );

  const equipments =
    asArray(
      source.equipments,
    )
      .map(
        normalizeEquipment,
      );

  const topEquipmentRaw =
    source.topEquipment;

  const topEquipment =
    topEquipmentRaw &&
      typeof topEquipmentRaw ===
        "object"
      ? normalizeEquipment(
        topEquipmentRaw,
      )
      : equipments[0] ??
        null;

  const occurrences =
    safeNumber(
      source.occurrences,
      0,
    );

  const downtimeMinutes =
    safeNumber(
      source.downtimeMinutes,
      0,
    );

  const mttrFromApi =
    safeNumber(
      source.mttr,
      Number.NaN,
    );

  return {
    line:
      safeString(
        source.line,
        "Linha não informada",
      ),

    occurrences,

    downtimeMinutes,

    mttr:
      Number.isFinite(
        mttrFromApi,
      )
        ? mttrFromApi
        : occurrences > 0
          ? downtimeMinutes /
            occurrences
          : 0,

    occurrencePercentage:
      safeNumber(
        source.occurrencePercentage,
        0,
      ),

    downtimePercentage:
      safeNumber(
        source.downtimePercentage,
        0,
      ),

    origin: {
      operation:
        normalizeOriginMetric(
          originRaw.operation,
        ),

      maintenance:
        normalizeOriginMetric(
          originRaw.maintenance,
        ),

      unclassified:
        normalizeOriginMetric(
          originRaw.unclassified,
        ),
    },

    topEquipment,

    equipments,
  };
}


function normalizeResponse(
  value: unknown,
): LineImpactResponse {
  const source =
    asRecord(
      value,
    );

  const summaryRaw =
    asRecord(
      source.summary,
    );

  const items =
    asArray(
      source.items,
    )
      .map(
        normalizeLineItem,
      );

  const calculatedOccurrences =
    items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.occurrences,
      0,
    );

  const calculatedDowntime =
    items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.downtimeMinutes,
      0,
    );

  const summaryOccurrences =
    safeNumber(
      summaryRaw.occurrences,
      calculatedOccurrences,
    );

  const summaryDowntime =
    safeNumber(
      summaryRaw.downtimeMinutes,
      calculatedDowntime,
    );

  const summaryMttr =
    safeNumber(
      summaryRaw.mttr,
      summaryOccurrences > 0
        ? summaryDowntime /
          summaryOccurrences
        : 0,
    );

  return {
    success:
      source.success ===
      true,

    summary: {
      lines:
        safeNumber(
          summaryRaw.lines,
          items.length,
        ),

      occurrences:
        summaryOccurrences,

      downtimeMinutes:
        summaryDowntime,

      mttr:
        summaryMttr,
    },

    items,
  };
}


/* =========================================================
   FORMATTERS
========================================================= */

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

  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits,
    },
  ).format(
    safe,
  );
}


function formatMinutes(
  value: number,
  maximumFractionDigits =
    1,
): string {
  return `${formatNumber(
    value,
    maximumFractionDigits,
  )} min`;
}


function metricValue(
  item: LineImpactItem,
  metric: LineMetric,
): number {
  switch (
    metric
  ) {
    case "OCCURRENCES":
      return item.occurrences;

    case "MTTR":
      return item.mttr;

    case "DOWNTIME":

    default:
      return item.downtimeMinutes;
  }
}


function formatMetricValue(
  value: number,
  metric: LineMetric,
): string {
  if (
    metric ===
    "OCCURRENCES"
  ) {
    return formatNumber(
      value,
      0,
    );
  }

  return formatMinutes(
    value,
    1,
  );
}


function metricDescription(
  metric: LineMetric,
): string {
  switch (
    metric
  ) {
    case "OCCURRENCES":
      return "maior número de ocorrências";

    case "MTTR":
      return "maior MTTR";

    case "DOWNTIME":

    default:
      return "maior tempo de parada";
  }
}


/* =========================================================
   UI PARTS
========================================================= */

function SummaryMetric({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[27px] font-semibold leading-none tracking-[-0.055em] text-[#1E2125] sm:text-[30px]">
        {value}
      </div>

      <p className="mt-2 text-[10px] font-medium text-[#969BA1]">
        {label}
      </p>
    </div>
  );
}


function LoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="flex items-center gap-3 text-[12px] font-medium text-[#92979D]">
        <LoaderCircle
          size={16}
          className="animate-spin text-[#E41E2B]"
        />

        Carregando impacto por linha
      </div>
    </div>
  );
}


function ErrorState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-6">
      <div className="max-w-[420px] text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF0F1] text-[#D53640]">
          <AlertCircle
            size={18}
          />
        </div>

        <p className="mt-4 text-[14px] font-semibold text-[#282C30]">
          Não foi possível carregar a análise
        </p>

        <p className="mt-2 text-[11px] leading-5 text-[#8E9399]">
          {message}
        </p>
      </div>
    </div>
  );
}


function EmptyState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-6">
      <div className="max-w-[420px] text-center">
        <p className="text-[14px] font-semibold text-[#282C30]">
          Nenhuma linha encontrada
        </p>

        <p className="mt-2 text-[11px] leading-5 text-[#8E9399]">
          Não existem dados de linha para o recorte selecionado.
        </p>
      </div>
    </div>
  );
}


/* =========================================================
   COMPONENT
========================================================= */

export function LineImpactAnalysis({
  startDate,
  endDate,
  line,
  equipment,
  onOpenEquipmentHistory,
}: LineImpactAnalysisProps) {
  const [
    metric,
    setMetric,
  ] =
    useState<LineMetric>(
      "DOWNTIME",
    );

  const [
    data,
    setData,
  ] =
    useState<
      LineImpactResponse | null
    >(null);

  const [
    selectedLine,
    setSelectedLine,
  ] =
    useState(
      "",
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


  /* =======================================================
     FETCH
  ======================================================= */

  useEffect(
    () => {
      const controller =
        new AbortController();

      async function load() {
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
              `${API_ENDPOINT}?${params.toString()}`,
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

          const raw =
            await response.json();

          const rawRecord =
            asRecord(
              raw,
            );

          if (
            !response.ok ||
            rawRecord.success !==
              true
          ) {
            throw new Error(
              safeString(
                rawRecord.message,
                "Não foi possível carregar os dados.",
              ),
            );
          }

          const normalized =
            normalizeResponse(
              raw,
            );

          setData(
            normalized,
          );

          setSelectedLine(
            (
              current,
            ) => {
              if (
                normalized.items.some(
                  (
                    item,
                  ) =>
                    item.line ===
                    current,
                )
              ) {
                return current;
              }

              return normalized
                .items[0]
                ?.line ??
                "";
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

          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "Não foi possível carregar os dados.",
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

      void load();

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


  /* =======================================================
     RANKING
  ======================================================= */

  const rankedItems =
    useMemo(
      () => {
        if (
          !data
        ) {
          return [];
        }

        return [
          ...data.items,
        ].sort(
          (
            a,
            b,
          ) =>
            metricValue(
              b,
              metric,
            ) -
            metricValue(
              a,
              metric,
            ),
        );
      },
      [
        data,
        metric,
      ],
    );


  const selectedItem =
    useMemo(
      () => {
        return (
          rankedItems.find(
            (
              item,
            ) =>
              item.line ===
              selectedLine,
          ) ??
          rankedItems[0] ??
          null
        );
      },
      [
        rankedItems,
        selectedLine,
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
          rankedItems.findIndex(
            (
              item,
            ) =>
              item.line ===
              selectedItem.line,
          );

        return index >=
          0
          ? index +
            1
          : 0;
      },
      [
        rankedItems,
        selectedItem,
      ],
    );


  const maximumMetric =
    useMemo(
      () => {
        return Math.max(
          ...rankedItems.map(
            (
              item,
            ) =>
              metricValue(
                item,
                metric,
              ),
          ),
          1,
        );
      },
      [
        rankedItems,
        metric,
      ],
    );


  const maximumEquipmentDowntime =
    useMemo(
      () => {
        if (
          !selectedItem
        ) {
          return 1;
        }

        return Math.max(
          ...selectedItem.equipments.map(
            (
              item,
            ) =>
              item.downtimeMinutes,
          ),
          1,
        );
      },
      [
        selectedItem,
      ],
    );


  /* =======================================================
     STATES
  ======================================================= */

  if (
    loading &&
    !data
  ) {
    return (
      <section className="mt-6 overflow-hidden rounded-[30px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
        <LoadingState />
      </section>
    );
  }


  if (
    error &&
    !data
  ) {
    return (
      <section className="mt-6 overflow-hidden rounded-[30px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
        <ErrorState
          message={
            error
          }
        />
      </section>
    );
  }


  if (
    !data ||
    rankedItems.length ===
      0
  ) {
    return (
      <section className="mt-6 overflow-hidden rounded-[30px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
        <EmptyState />
      </section>
    );
  }


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <section className="relative mt-6 overflow-hidden rounded-[30px] border border-black/[0.045] bg-white shadow-[0_12px_40px_rgba(28,31,34,0.03)]">
      {/* ===================================================
          LOADING OVERLAY
      ==================================================== */}

      <div
        className={
          `pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-white/35 pt-4 backdrop-blur-[1px] transition-opacity duration-200 ${
            loading
              ? "opacity-100"
              : "opacity-0"
          }`
        }
      >
        {loading && (
          <div className="flex items-center gap-2 rounded-full border border-black/[0.055] bg-white px-3 py-2 text-[9px] font-medium text-[#777C82] shadow-sm">
            <LoaderCircle
              size={11}
              className="animate-spin text-[#E41E2B]"
            />

            Atualizando análise
          </div>
        )}
      </div>


      {/* ===================================================
          HEADER
      ==================================================== */}

      <div className="border-b border-black/[0.05] px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#202327] px-2 text-[10px] font-bold text-white">
              06
            </div>

            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#24272B]">
                Impacto por linha
              </h2>

              <p className="mt-1 text-[11px] text-[#979CA2]">
                Compare o impacto das linhas e identifique onde as perdas estão concentradas.
              </p>
            </div>
          </div>


          {/* METRIC SELECTOR */}

          <div className="inline-flex w-fit rounded-full bg-[#F2F2F1] p-1">
            {METRIC_OPTIONS.map(
              (
                option,
              ) => {
                const active =
                  metric ===
                  option.id;

                return (
                  <button
                    key={
                      option.id
                    }
                    type="button"
                    onClick={() =>
                      setMetric(
                        option.id,
                      )
                    }
                    className={
                      `rounded-full px-4 py-2 text-[10px] font-medium transition-all duration-200 ${
                        active
                          ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.13)]"
                          : "text-[#91969C] hover:bg-white hover:text-[#555A60]"
                      }`
                    }
                  >
                    {option.label}
                  </button>
                );
              },
            )}
          </div>
        </div>
      </div>


      {/* ===================================================
          SUMMARY
      ==================================================== */}

      <div className="border-b border-black/[0.045] bg-[#FAFAF9] px-6 py-6 sm:px-8">
        <div className="grid gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="xl:border-r xl:border-black/[0.06] xl:pr-8">
            <SummaryMetric
              value={
                formatNumber(
                  data.summary.lines,
                )
              }
              label="Linhas analisadas"
            />
          </div>

          <div className="xl:border-r xl:border-black/[0.06] xl:px-8">
            <SummaryMetric
              value={
                formatNumber(
                  data.summary
                    .occurrences,
                )
              }
              label="Ocorrências"
            />
          </div>

          <div className="xl:border-r xl:border-black/[0.06] xl:px-8">
            <SummaryMetric
              value={
                <>
                  {formatNumber(
                    data.summary
                      .downtimeMinutes,
                    1,
                  )}

                  <span className="ml-1.5 text-[11px] font-medium tracking-normal text-[#9BA0A6]">
                    min
                  </span>
                </>
              }
              label="Tempo de parada"
            />
          </div>

          <div className="xl:pl-8">
            <SummaryMetric
              value={
                <>
                  {formatNumber(
                    data.summary.mttr,
                    1,
                  )}

                  <span className="ml-1.5 text-[11px] font-medium tracking-normal text-[#9BA0A6]">
                    min
                  </span>
                </>
              }
              label="MTTR geral"
            />
          </div>
        </div>
      </div>


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <div className="grid lg:grid-cols-[1.18fr_0.82fr]">
        {/* =================================================
            RANKING
        ================================================== */}

        <div className="border-b border-black/[0.045] px-6 py-7 lg:border-b-0 lg:border-r lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A2A6AB]">
                Ranking
              </p>

              <p className="mt-1.5 text-[12px] font-medium text-[#41464B]">
                Linhas com {metricDescription(
                  metric,
                )}
              </p>
            </div>

            <p className="hidden text-[9px] text-[#AAAFB4] sm:block">
              Selecione uma linha
            </p>
          </div>


          <div className="mt-5 space-y-1">
            {rankedItems.map(
              (
                item,
                index,
              ) => {
                const active =
                  selectedItem
                    ?.line ===
                  item.line;

                const value =
                  metricValue(
                    item,
                    metric,
                  );

                const relative =
                  maximumMetric > 0
                    ? (
                      value /
                      maximumMetric
                    ) *
                    100
                    : 0;

                return (
                  <button
                    key={
                      item.line
                    }
                    type="button"
                    onClick={() =>
                      setSelectedLine(
                        item.line,
                      )
                    }
                    className={
                      `group w-full rounded-[18px] border px-4 py-4 text-left transition-all duration-200 ${
                        active
                          ? "border-[#E9C5C8] bg-[#FFF8F8]"
                          : "border-transparent hover:border-black/[0.045] hover:bg-[#FAFAF9]"
                      }`
                    }
                  >
                    <div className="flex items-center justify-between gap-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={
                            `flex h-7 min-w-7 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-200 ${
                              active
                                ? "bg-[#E41E2B] text-white"
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
                          <p className="truncate text-[12px] font-semibold tracking-[-0.015em] text-[#25292D]">
                            {item.line}
                          </p>

                          {item.topEquipment && (
                            <p className="mt-0.5 truncate text-[9px] text-[#A0A4A9]">
                              Maior impacto:{" "}
                              {
                                item
                                  .topEquipment
                                  .name
                              }
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="shrink-0 text-[11px] font-semibold text-[#34383D]">
                        {formatMetricValue(
                          value,
                          metric,
                        )}
                      </p>
                    </div>


                    {/* BAR */}

                    <div className="mt-3.5 h-[4px] overflow-hidden rounded-full bg-[#ECEDEC]">
                      <div
                        className={
                          `h-full rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                            active
                              ? "bg-[#E41E2B]"
                              : "bg-[#41464B]"
                          }`
                        }
                        style={{
                          width:
                            `${Math.max(
                              relative,
                              3,
                            )}%`,
                        }}
                      />
                    </div>


                    {/* SUPPORTING VALUES */}

                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#9A9FA5]">
                      <span>
                        {formatNumber(
                          item.occurrences,
                        )}{" "}
                        ocorrências
                      </span>

                      <span>
                        {formatNumber(
                          item
                            .downtimeMinutes,
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
        </div>


        {/* =================================================
            SELECTED LINE
        ================================================== */}

        <div className="px-6 py-7 sm:px-8">
          {selectedItem && (
            <>
              {/* ===========================================
                  HERO
              ============================================ */}

              <div className="relative overflow-hidden rounded-[26px] bg-[#202327] p-6 text-white shadow-[0_14px_36px_rgba(32,35,39,0.12)]">
                <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/[0.035] blur-[2px]" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
                        Linha selecionada
                      </p>

                      <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-white">
                        {selectedItem.line}
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
                          )} no ranking
                        </div>
                      )}
                  </div>


                  <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[9px] font-medium text-white/38">
                        Ocorrências
                      </p>

                      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em]">
                        {formatNumber(
                          selectedItem
                            .occurrences,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-medium text-white/38">
                        Tempo de parada
                      </p>

                      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em]">
                        {formatNumber(
                          selectedItem
                            .downtimeMinutes,
                          1,
                        )}

                        <span className="ml-1 text-[10px] font-medium tracking-normal text-white/38">
                          min
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-medium text-white/38">
                        MTTR
                      </p>

                      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em]">
                        {formatNumber(
                          selectedItem
                            .mttr,
                          1,
                        )}

                        <span className="ml-1 text-[10px] font-medium tracking-normal text-white/38">
                          min
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>


              {/* ===========================================
                  ORIGIN
              ============================================ */}

              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <Gauge
                    size={14}
                    strokeWidth={1.7}
                    className="text-[#64696F]"
                  />

                  <p className="text-[10px] font-semibold text-[#303438]">
                    Origem das ocorrências
                  </p>
                </div>


                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[9px] text-[#A0A4A9]">
                      Manutenção
                    </p>

                    <p className="mt-1 text-[19px] font-semibold tracking-[-0.04em] text-[#25292D]">
                      {formatNumber(
                        selectedItem
                          .origin
                          .maintenance
                          .occurrencePercentage,
                        1,
                      )}
                      %
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[9px] text-[#A0A4A9]">
                      Operação
                    </p>

                    <p className="mt-1 text-[19px] font-semibold tracking-[-0.04em] text-[#25292D]">
                      {formatNumber(
                        selectedItem
                          .origin
                          .operation
                          .occurrencePercentage,
                        1,
                      )}
                      %
                    </p>
                  </div>
                </div>


                <div className="mt-3 flex h-[7px] overflow-hidden rounded-full bg-[#ECEDEC]">
                  <div
                    className="h-full bg-[#E41E2B] transition-[width] duration-500"
                    style={{
                      width:
                        `${Math.max(
                          0,
                          selectedItem
                            .origin
                            .maintenance
                            .occurrencePercentage,
                        )}%`,
                    }}
                  />

                  <div
                    className="h-full bg-[#3D4247] transition-[width] duration-500"
                    style={{
                      width:
                        `${Math.max(
                          0,
                          selectedItem
                            .origin
                            .operation
                            .occurrencePercentage,
                        )}%`,
                    }}
                  />
                </div>


                {selectedItem
                  .origin
                  .unclassified
                  .occurrences >
                  0 && (
                    <p className="mt-2 text-[9px] text-[#A2A6AB]">
                      {formatNumber(
                        selectedItem
                          .origin
                          .unclassified
                          .occurrences,
                      )}{" "}
                      ocorrências ainda não classificadas.
                    </p>
                  )}
              </div>


              {/* ===========================================
                  EQUIPMENTS
              ============================================ */}

              <div className="mt-7 border-t border-black/[0.055] pt-6">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#A1A5AA]">
                    Equipamentos
                  </p>

                  <p className="mt-1.5 text-[12px] font-medium text-[#41464B]">
                    Equipamentos de maior impacto
                  </p>
                </div>


                {selectedItem
                  .equipments.length ===
                0 ? (
                  <p className="mt-5 text-[11px] text-[#969BA1]">
                    Nenhum equipamento encontrado para esta linha.
                  </p>
                ) : (
                  <div className="mt-5">
                    {selectedItem
                      .equipments
                      .map(
                        (
                          equipmentItem,
                          index,
                        ) => {
                          const relative =
                            maximumEquipmentDowntime >
                            0
                              ? (
                                equipmentItem
                                  .downtimeMinutes /
                                maximumEquipmentDowntime
                              ) *
                              100
                              : 0;

                          const canOpenHistory =
                            Boolean(
                              onOpenEquipmentHistory,
                            ) &&
                            equipmentItem.name !==
                            "Equipamento não informado";

                          return (
                            <div
                              key={
                                `${equipmentItem.name}-${index}`
                              }
                              className={
                                index ===
                                  0
                                  ? "pb-5"
                                  : "border-t border-black/[0.045] py-5"
                              }
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#F0F1F1] text-[9px] font-bold text-[#71767C]">
                                    {String(
                                      index +
                                      1,
                                    ).padStart(
                                      2,
                                      "0",
                                    )}
                                  </div>

                                  <p className="truncate text-[11px] font-semibold text-[#2B2F33]">
                                    {
                                      equipmentItem.name
                                    }
                                  </p>
                                </div>

                                <p className="shrink-0 text-[10px] font-semibold text-[#34383D]">
                                  {formatNumber(
                                    equipmentItem
                                      .downtimeMinutes,
                                    1,
                                  )}{" "}
                                  min
                                </p>
                              </div>


                              <div className="ml-10 mt-3 h-[4px] overflow-hidden rounded-full bg-[#ECEDEC]">
                                <div
                                  className="h-full rounded-full bg-[#41464B] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                  style={{
                                    width:
                                      `${Math.max(
                                        relative,
                                        4,
                                      )}%`,
                                  }}
                                />
                              </div>


                              <div className="ml-10 mt-2.5 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#9A9FA5]">
                                  <span>
                                    {formatNumber(
                                      equipmentItem
                                        .occurrences,
                                    )}{" "}
                                    ocorrências
                                  </span>

                                  <span>
                                    MTTR{" "}
                                    {formatNumber(
                                      equipmentItem
                                        .mttr,
                                      1,
                                    )}{" "}
                                    min
                                  </span>
                                </div>


                                {canOpenHistory && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenEquipmentHistory?.(
                                        equipmentItem.name,
                                        selectedItem.line,
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-full bg-[#202327] px-3 py-1.5 text-[9px] font-semibold text-white transition-all duration-180 hover:-translate-y-px hover:bg-[#111315]"
                                  >
                                    Ver histórico

                                    <ArrowUpRight
                                      size={10}
                                      strokeWidth={1.8}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        },
                      )}
                  </div>
                )}
              </div>


              {/* ===========================================
                  FOOTER
              ============================================ */}

              <div className="mt-1 flex items-center gap-2 border-t border-black/[0.045] pt-4 text-[9px] text-[#A0A4A9]">
                <Factory
                  size={12}
                  strokeWidth={1.7}
                />

                A linha selecionada altera apenas o foco visual deste bloco.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}