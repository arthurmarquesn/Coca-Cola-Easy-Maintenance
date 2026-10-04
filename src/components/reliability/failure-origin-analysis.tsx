"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Search,
  Undo2,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

export type FailureOrigin =
  | "OPERACAO"
  | "MANUTENCAO";

export type FailureOriginFilter =
  | FailureOrigin
  | "NAO_CLASSIFICADO";

export interface FailureOriginSummary {
  operation: number;
  maintenance: number;
  unclassified: number;
  classified: number;
  total: number;
  operationPercentage: number;
  maintenancePercentage: number;
  unclassifiedPercentage: number;
}

interface FailureOriginEvent {
  id: number;

  eventDate:
    | string
    | null;

  line:
    | string
    | null;

  equipment:
    | string
    | null;

  stopType:
    | string
    | null;

  stopSubkey:
    | string
    | null;

  stopKey:
    | string
    | null;

  observation:
    | string
    | null;

  downtimeMinutes: number;

  prediction: {
    origin:
      | FailureOrigin
      | null;

    confidence:
      | number
      | null;

    confidenceLevel:
      | string
      | null;

    modelVersion:
      | string
      | null;
  };

  review: {
    manualOrigin:
      | FailureOrigin
      | null;

    note:
      | string
      | null;

    reviewedAt:
      | string
      | null;

    reviewedByUserId:
      | number
      | null;

    reviewedByName:
      | string
      | null;
  };

  effectiveOrigin:
    | FailureOrigin
    | null;

  wasReviewed: boolean;
}

interface FailureOriginPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface FailureOriginAnalysisProps {
  data: FailureOriginSummary;

  startDate: string;
  endDate: string;
  line: string;
  equipment: string;

  onChanged:
    () =>
      | Promise<void>
      | void;
}

function formatNumber(
  value: number,
  maximumFractionDigits = 0,
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

function failureOriginLabel(
  origin:
    FailureOriginFilter,
): string {
  switch (
    origin
  ) {
    case "OPERACAO":
      return "Operação";

    case "MANUTENCAO":
      return "Manutenção";

    case "NAO_CLASSIFICADO":

    default:
      return "Não classificado";
  }
}

function formatEventDate(
  value:
    | string
    | null,
): string {
  if (!value) {
    return "Data não informada";
  }

  const parts =
    value
      .slice(
        0,
        10,
      )
      .split(
        "-",
      );

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function confidenceText(
  value:
    number | null,
): string | null {
  if (
    value === null ||
    !Number.isFinite(
      value,
    )
  ) {
    return null;
  }

  const percentage =
    value <= 1
      ? value * 100
      : value;

  return `${formatNumber(
    percentage,
    1,
  )}%`;
}

function FailureOriginOverview({
  data,
  onSelectOrigin,
}: {
  data: FailureOriginSummary;

  onSelectOrigin: (
    origin: FailureOriginFilter,
  ) => void;
}) {
  const operationPercentage =
    Math.min(
      100,
      Math.max(
        0,
        data.operationPercentage,
      ),
    );

  const maintenancePercentage =
    Math.min(
      100,
      Math.max(
        0,
        data.maintenancePercentage,
      ),
    );

  const coveragePercentage =
    data.total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (
              data.classified /
              data.total
            ) *
              100,
          ),
        )
      : 0;

  const difference =
    Math.abs(
      operationPercentage -
        maintenancePercentage,
    );

  const dominantOrigin =
    data.classified <= 0
      ? null
      : operationPercentage ===
          maintenancePercentage
        ? "Equilíbrio"
        : operationPercentage >
            maintenancePercentage
          ? "Operação"
          : "Manutenção";

  const hasClassified =
    data.classified > 0;

  return (
    <div>
      <div className="overflow-hidden rounded-[28px] border border-black/[0.045] bg-[#F7F7F6]">
        <div className="grid lg:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              onSelectOrigin(
                "OPERACAO",
              )
            }
            className="group relative overflow-hidden border-b border-black/[0.05] px-6 py-6 text-left outline-none transition-all duration-200 hover:bg-white focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#E41E2B]/20 sm:px-7 sm:py-7 lg:border-b-0 lg:border-r"
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-[#E41E2B] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E41E2B] shadow-[0_0_0_5px_rgba(228,30,43,0.07)]" />

                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#5D6268]">
                  Operação
                </p>
              </div>

              <span className="text-[9px] font-semibold text-[#A1A5AA] transition-colors duration-150 group-hover:text-[#C92832]">
                Ver ocorrências
              </span>
            </div>

            <div className="mt-8 flex items-end justify-between gap-5">
              <div>
                <p className="text-[48px] font-semibold leading-none tracking-[-0.065em] text-[#1E2125] sm:text-[58px]">
                  {formatNumber(
                    operationPercentage,
                    1,
                  )}

                  <span className="ml-1 text-[21px] font-medium tracking-[-0.025em] text-[#9DA2A8]">
                    %
                  </span>
                </p>

                <p className="mt-3 text-[11px] font-medium text-[#8E9399]">
                  entre as ocorrências classificadas
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#2B2F33]">
                  {formatNumber(
                    data.operation,
                  )}
                </p>

                <p className="mt-1 text-[9px] font-medium text-[#A1A5AA]">
                  ocorrências
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onSelectOrigin(
                "MANUTENCAO",
              )
            }
            className="group relative overflow-hidden px-6 py-6 text-left outline-none transition-all duration-200 hover:bg-white focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-black/10 sm:px-7 sm:py-7 lg:text-right"
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-right scale-x-0 bg-[#202327] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />

            <div className="flex items-center justify-between gap-4 lg:flex-row-reverse">
              <div className="flex items-center gap-2.5 lg:flex-row-reverse">
                <span className="h-2.5 w-2.5 rounded-full bg-[#202327] shadow-[0_0_0_5px_rgba(32,35,39,0.06)]" />

                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#5D6268]">
                  Manutenção
                </p>
              </div>

              <span className="text-[9px] font-semibold text-[#A1A5AA] transition-colors duration-150 group-hover:text-[#2F3337]">
                Ver ocorrências
              </span>
            </div>

            <div className="mt-8 flex items-end justify-between gap-5 lg:flex-row-reverse">
              <div>
                <p className="text-[48px] font-semibold leading-none tracking-[-0.065em] text-[#1E2125] sm:text-[58px]">
                  {formatNumber(
                    maintenancePercentage,
                    1,
                  )}

                  <span className="ml-1 text-[21px] font-medium tracking-[-0.025em] text-[#9DA2A8]">
                    %
                  </span>
                </p>

                <p className="mt-3 text-[11px] font-medium text-[#8E9399]">
                  entre as ocorrências classificadas
                </p>
              </div>

              <div className="shrink-0 lg:text-left">
                <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#2B2F33]">
                  {formatNumber(
                    data.maintenance,
                  )}
                </p>

                <p className="mt-1 text-[9px] font-medium text-[#A1A5AA]">
                  ocorrências
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="border-t border-black/[0.045] bg-white/70 px-6 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#9DA2A8]">
              Distribuição das classificadas
            </p>

            <p className="text-[9px] font-medium text-[#A0A4A9]">
              {formatNumber(
                data.classified,
              )}{" "}
              ocorrências
            </p>
          </div>

          <div className="mt-3 flex h-[10px] overflow-hidden rounded-full bg-[#E7E9EA]">
            {hasClassified ? (
              <>
                <button
                  type="button"
                  aria-label="Ver ocorrências de operação"
                  onClick={() =>
                    onSelectOrigin(
                      "OPERACAO",
                    )
                  }
                  className="h-full bg-[#E41E2B] transition-[width,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:brightness-95"
                  style={{
                    width:
                      `${operationPercentage}%`,
                  }}
                />

                <button
                  type="button"
                  aria-label="Ver ocorrências de manutenção"
                  onClick={() =>
                    onSelectOrigin(
                      "MANUTENCAO",
                    )
                  }
                  className="h-full bg-[#202327] transition-[width,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:brightness-125"
                  style={{
                    width:
                      `${maintenancePercentage}%`,
                  }}
                />
              </>
            ) : (
              <div className="h-full w-full bg-[#E7E9EA]" />
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[9px] font-medium text-[#9A9FA5]">
            <span>
              Operação
            </span>

            <span>
              Manutenção
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-black/[0.045] bg-white">
        <div className="grid sm:grid-cols-3">
          <div className="border-b border-black/[0.045] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#A1A5AA]">
              Origem predominante
            </p>

            <p className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[#303438]">
              {dominantOrigin ??
                "Sem classificação"}
            </p>
          </div>

          <div className="border-b border-black/[0.045] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#A1A5AA]">
              Diferença
            </p>

            <p className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[#303438]">
              {hasClassified
                ? `${formatNumber(
                    difference,
                    1,
                  )} p.p.`
                : "—"}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#A1A5AA]">
              Cobertura
            </p>

            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#303438]">
                {formatNumber(
                  coveragePercentage,
                  1,
                )}%
              </p>

              <span className="text-[9px] text-[#9A9FA5]">
                {formatNumber(
                  data.classified,
                )}{" "}
                de{" "}
                {formatNumber(
                  data.total,
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 rounded-[22px] bg-[#F7F7F6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-medium text-[#6F747A]">
              Cobertura da classificação
            </p>

            <p className="text-[10px] font-semibold text-[#34383D]">
              {formatNumber(
                coveragePercentage,
                1,
              )}%
            </p>
          </div>

          <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[#E4E6E7]">
            <div
              className="h-full rounded-full bg-[#202327] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width:
                  `${coveragePercentage}%`,
              }}
            />
          </div>
        </div>

        {data.unclassified > 0 ? (
          <button
            type="button"
            onClick={() =>
              onSelectOrigin(
                "NAO_CLASSIFICADO",
              )
            }
            className="shrink-0 rounded-full bg-[#202327] px-4 py-2.5 text-[10px] font-semibold text-white transition-all duration-180 hover:-translate-y-px hover:bg-[#111315]"
          >
            {formatNumber(
              data.unclassified,
            )}{" "}
            aguardando classificação
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2 text-[10px] font-medium text-[#777C82]">
            <CheckCircle2
              size={13}
              className="text-[#6F747A]"
            />

            Todas as ocorrências foram classificadas
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   DRAWER DAS OCORRÊNCIAS
========================================================= */

function FailureOriginReviewDrawer({
  origin,
  startDate,
  endDate,
  line,
  equipment,
  onClose,
  onChanged,
}: {
  origin:
    | FailureOriginFilter
    | null;

  startDate: string;
  endDate: string;
  line: string;
  equipment: string;

  onClose:
    () => void;

  onChanged:
    () =>
      | Promise<void>
      | void;
}) {
  const [
    items,
    setItems,
  ] =
    useState<
      FailureOriginEvent[]
    >([]);

  const [
    pagination,
    setPagination,
  ] =
    useState<
      FailureOriginPagination
    >({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });

  const [
    page,
    setPage,
  ] =
    useState(
      1,
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );

  const [
    appliedSearch,
    setAppliedSearch,
  ] =
    useState(
      "",
    );

  const [
    editable,
    setEditable,
  ] =
    useState(
      false,
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
    editing,
    setEditing,
  ] =
    useState<
      FailureOriginEvent | null
    >(null);

  const [
    editOrigin,
    setEditOrigin,
  ] =
    useState<
      FailureOrigin
    >(
      "OPERACAO",
    );

  const [
    editNote,
    setEditNote,
  ] =
    useState(
      "",
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const loadItems =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        if (!origin) {
          return;
        }

        setLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const params =
            new URLSearchParams();

          params.set(
            "origin",
            origin,
          );

          params.set(
            "page",
            String(
              page,
            ),
          );

          params.set(
            "pageSize",
            "20",
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

          if (
            equipment
          ) {
            params.set(
              "equipment",
              equipment,
            );
          }

          if (
            appliedSearch
          ) {
            params.set(
              "search",
              appliedSearch,
            );
          }

          const response =
            await fetch(
              `/api/analytics/reliability/origins?${params.toString()}`,
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
                "Não foi possível carregar as ocorrências.",
            );
          }

          setItems(
            Array.isArray(
              raw.items,
            )
              ? raw.items
              : [],
          );

          setEditable(
            raw.editable ===
              true,
          );

          const paginationRaw =
            raw.pagination &&
            typeof raw.pagination ===
              "object"
              ? raw.pagination
              : {};

          setPagination({
            page:
              Number(
                paginationRaw.page ??
                  page,
              ),

            pageSize:
              Number(
                paginationRaw.pageSize ??
                  20,
              ),

            total:
              Number(
                paginationRaw.total ??
                  0,
              ),

            totalPages:
              Math.max(
                1,
                Number(
                  paginationRaw.totalPages ??
                    1,
                ),
              ),
          });
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
              : "Não foi possível carregar as ocorrências.",
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
        origin,
        page,
        appliedSearch,
        startDate,
        endDate,
        line,
        equipment,
      ],
    );

  useEffect(() => {
    if (!origin) {
      return;
    }

    setPage(
      1,
    );

    setSearch(
      "",
    );

    setAppliedSearch(
      "",
    );

    setEditing(
      null,
    );
  }, [
    origin,
  ]);

  useEffect(() => {
    if (!origin) {
      return;
    }

    const controller =
      new AbortController();

    void loadItems(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [
    origin,
    loadItems,
  ]);

  useEffect(() => {
    if (!origin) {
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
        if (
          editing
        ) {
          setEditing(
            null,
          );

          return;
        }

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
    origin,
    editing,
    onClose,
  ]);

  function openReview(
    item:
      FailureOriginEvent,
  ) {
    if (!editable) {
      return;
    }

    setEditing(
      item,
    );

    setEditOrigin(
      item.review.manualOrigin ??
        item.effectiveOrigin ??
        item.prediction.origin ??
        "OPERACAO",
    );

    setEditNote(
      item.review.note ??
        "",
    );

    setError(
      "",
    );
  }

  async function saveReview() {
    if (!editing) {
      return;
    }

    setSaving(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/analytics/reliability/origins",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                eventId:
                  editing.id,

                manualOrigin:
                  editOrigin,

                note:
                  editNote,
              }),
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
            "Não foi possível salvar a revisão.",
        );
      }

      setEditing(
        null,
      );

      await Promise.all([
        loadItems(),

        Promise.resolve(
          onChanged(),
        ),
      ]);
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Não foi possível salvar a revisão.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  async function restorePrediction() {
    if (
      !editing ||
      !editing.wasReviewed
    ) {
      return;
    }

    setSaving(
      true,
    );

    setError(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/analytics/reliability/origins",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                eventId:
                  editing.id,

                manualOrigin:
                  null,

                note:
                  editNote,
              }),
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
            "Não foi possível restaurar a previsão.",
        );
      }

      setEditing(
        null,
      );

      await Promise.all([
        loadItems(),

        Promise.resolve(
          onChanged(),
        ),
      ]);
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Não foi possível restaurar a previsão.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  if (!origin) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={
        `Ocorrências de ${failureOriginLabel(
          origin,
        )}`
      }
    >
      <button
        type="button"
        aria-label="Fechar ocorrências"
        onClick={
          onClose
        }
        className="absolute inset-0 h-full w-full cursor-default bg-black/20 backdrop-blur-[2px]"
      />

      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[620px] flex-col border-l border-black/[0.06] bg-white shadow-[-18px_0_50px_rgba(0,0,0,0.08)]">
        <div className="border-b border-[#ECEDEF] px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#9A9FA5]">
                Origem das falhas
              </p>

              <h3 className="mt-1.5 text-[22px] font-semibold tracking-[-0.035em] text-[#202327]">
                {failureOriginLabel(
                  origin,
                )}
              </h3>

              <p className="mt-1 text-[11px] text-[#969BA1]">
                {formatNumber(
                  pagination.total,
                )}{" "}
                {pagination.total ===
                1
                  ? "ocorrência"
                  : "ocorrências"}

                {editable
                  ? " · revisão disponível para analistas"
                  : " no recorte atual"}
              </p>
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#777C82] transition hover:bg-[#F4F4F3]"
            >
              <X
                size={18}
              />
            </button>
          </div>

          <form
            className="mt-5 flex gap-2"
            onSubmit={(
              event,
            ) => {
              event.preventDefault();

              setPage(
                1,
              );

              setAppliedSearch(
                search.trim(),
              );
            }}
          >
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A4A9]"
              />

              <input
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Buscar equipamento, linha ou descrição"
                className="h-10 w-full rounded-[11px] border border-[#DFE1E3] bg-[#FAFAF9] pl-9 pr-3 text-[11px] text-[#34383C] outline-none transition focus:border-[#BFC3C7] focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="h-10 rounded-[11px] bg-[#25282C] px-4 text-[10px] font-semibold text-white transition hover:bg-black"
            >
              Buscar
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {error && (
            <div className="mb-4 rounded-[12px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[11px] text-[#BF2C35]">
              {error}
            </div>
          )}

          {loading &&
          items.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <LoaderCircle
                size={21}
                className="animate-spin text-[#E41E2B]"
              />
            </div>
          ) : items.length ===
            0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <CheckCircle2
                size={28}
                className="text-[#A8ADB2]"
              />

              <p className="mt-4 text-[13px] font-semibold text-[#555A60]">
                Nenhuma ocorrência encontrada
              </p>

              <p className="mt-1 max-w-[300px] text-[11px] leading-5 text-[#9A9FA5]">
                Não há registros para essa origem com os filtros atuais.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(
                (
                  item,
                ) => {
                  const confidence =
                    confidenceText(
                      item.prediction
                        .confidence,
                    );

                  const effective =
                    item.effectiveOrigin;

                  const description =
                    item.observation?.trim() ||
                    item.stopKey?.trim() ||
                    item.stopSubkey?.trim() ||
                    item.stopType?.trim() ||
                    "Sem descrição informada";

                  return (
                    <article
                      key={
                        item.id
                      }
                      className="rounded-[16px] border border-[#E7E9EB] bg-white p-4 transition hover:border-[#D4D7DA]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                `inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                  effective ===
                                  "OPERACAO"
                                    ? "bg-[#FFF0F1] text-[#C92832]"
                                    : effective ===
                                        "MANUTENCAO"
                                      ? "bg-[#EFF0F1] text-[#42474C]"
                                      : "bg-[#F4F4F3] text-[#858A90]"
                                }`
                              }
                            >
                              {effective
                                ? failureOriginLabel(
                                    effective,
                                  )
                                : "Não classificado"}
                            </span>

                            {item.wasReviewed && (
                              <span className="rounded-full bg-[#F5F2E8] px-2.5 py-1 text-[9px] font-semibold text-[#8A702A]">
                                Revisado
                              </span>
                            )}
                          </div>

                          <p className="mt-3 text-[12px] font-semibold leading-5 text-[#303438]">
                            {item.equipment?.trim() ||
                              "Equipamento não informado"}
                          </p>

                          <p className="mt-1 text-[11px] leading-5 text-[#7E8389]">
                            {description}
                          </p>
                        </div>

                        {editable && (
                          <button
                            type="button"
                            onClick={() =>
                              openReview(
                                item,
                              )
                            }
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#DFE1E3] px-3 text-[10px] font-semibold text-[#555A60] transition hover:border-[#C9CDD0] hover:bg-[#F7F7F6]"
                          >
                            <Pencil
                              size={13}
                            />

                            Revisar
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 border-t border-[#F0F1F2] pt-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.08em] text-[#A1A5AA]">
                            Data
                          </p>

                          <p className="mt-1 text-[10px] font-medium text-[#555A60]">
                            {formatEventDate(
                              item.eventDate,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] uppercase tracking-[0.08em] text-[#A1A5AA]">
                            Linha
                          </p>

                          <p className="mt-1 truncate text-[10px] font-medium text-[#555A60]">
                            {item.line?.trim() ||
                              "Não informada"}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] uppercase tracking-[0.08em] text-[#A1A5AA]">
                            Parada
                          </p>

                          <p className="mt-1 text-[10px] font-medium text-[#555A60]">
                            {formatNumber(
                              item.downtimeMinutes,
                              1,
                            )}{" "}
                            min
                          </p>
                        </div>
                      </div>

                      {editable && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#F0F1F2] pt-3 text-[9px] text-[#999DA2]">
                          <span>
                            Previsão:{" "}
                            {item.prediction.origin
                              ? failureOriginLabel(
                                  item.prediction.origin,
                                )
                              : "não disponível"}
                          </span>

                          {confidence && (
                            <span>
                              Confiança:{" "}
                              {confidence}
                            </span>
                          )}

                          {item.review
                            .reviewedByName && (
                            <span>
                              Revisado por{" "}
                              {
                                item
                                  .review
                                  .reviewedByName
                              }
                            </span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[#ECEDEF] bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-[#969BA1]">
              Página{" "}
              {pagination.page}
              {" de "}
              {pagination.totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setPage(
                    (
                      current,
                    ) =>
                      Math.max(
                        1,
                        current -
                          1,
                      ),
                  )
                }
                disabled={
                  loading ||
                  pagination.page <=
                    1
                }
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#DFE1E3] text-[#686D73] transition hover:bg-[#F7F7F6] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Página anterior"
              >
                <ChevronLeft
                  size={15}
                />
              </button>

              <button
                type="button"
                onClick={() =>
                  setPage(
                    (
                      current,
                    ) =>
                      Math.min(
                        pagination.totalPages,
                        current +
                          1,
                      ),
                  )
                }
                disabled={
                  loading ||
                  pagination.page >=
                    pagination.totalPages
                }
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#DFE1E3] text-[#686D73] transition hover:bg-[#F7F7F6] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Próxima página"
              >
                <ChevronRight
                  size={15}
                />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {editing && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/20 p-4 sm:items-center">
          <div className="w-full max-w-[470px] rounded-[22px] border border-black/[0.06] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9A9FA5]">
                  Revisão manual
                </p>

                <h4 className="mt-1 text-[19px] font-semibold tracking-[-0.03em] text-[#25282C]">
                  Origem da ocorrência
                </h4>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(
                    null,
                  )
                }
                disabled={
                  saving
                }
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#777C82] transition hover:bg-[#F4F4F3] disabled:opacity-50"
              >
                <X
                  size={17}
                />
              </button>
            </div>

            <div className="mt-5 rounded-[14px] bg-[#F7F7F6] p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A9FA5]">
                Previsão original do modelo
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-semibold text-[#45494E]">
                  {editing.prediction.origin
                    ? failureOriginLabel(
                        editing.prediction.origin,
                      )
                    : "Não classificado"}
                </p>

                {confidenceText(
                  editing.prediction
                    .confidence,
                ) && (
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-medium text-[#84898F]">
                    {confidenceText(
                      editing.prediction
                        .confidence,
                    )}{" "}
                    confiança
                  </span>
                )}
              </div>

              <p className="mt-3 line-clamp-3 text-[10px] leading-5 text-[#8B9096]">
                {editing.observation?.trim() ||
                  editing.stopKey?.trim() ||
                  editing.stopSubkey?.trim() ||
                  "Sem descrição informada."}
              </p>
            </div>

            <div className="mt-5">
              <p className="text-[10px] font-semibold text-[#555A60]">
                Classificação validada
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setEditOrigin(
                      "OPERACAO",
                    )
                  }
                  disabled={
                    saving
                  }
                  className={
                    `rounded-[14px] border px-4 py-4 text-left transition ${
                      editOrigin ===
                      "OPERACAO"
                        ? "border-[#E41E2B] bg-[#FFF7F7] shadow-[0_0_0_1px_rgba(228,30,43,0.05)]"
                        : "border-[#E1E3E5] bg-white hover:bg-[#FAFAF9]"
                    }`
                  }
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-[#9A9FA5]">
                    Origem
                  </span>

                  <span
                    className={
                      `mt-2 block text-[13px] font-semibold ${
                        editOrigin ===
                        "OPERACAO"
                          ? "text-[#C92832]"
                          : "text-[#45494E]"
                      }`
                    }
                  >
                    Operação
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setEditOrigin(
                      "MANUTENCAO",
                    )
                  }
                  disabled={
                    saving
                  }
                  className={
                    `rounded-[14px] border px-4 py-4 text-left transition ${
                      editOrigin ===
                      "MANUTENCAO"
                        ? "border-[#393D41] bg-[#F7F7F6] shadow-[0_0_0_1px_rgba(0,0,0,0.03)]"
                        : "border-[#E1E3E5] bg-white hover:bg-[#FAFAF9]"
                    }`
                  }
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-[#9A9FA5]">
                    Origem
                  </span>

                  <span
                    className={
                      `mt-2 block text-[13px] font-semibold ${
                        editOrigin ===
                        "MANUTENCAO"
                          ? "text-[#303438]"
                          : "text-[#45494E]"
                      }`
                    }
                  >
                    Manutenção
                  </span>
                </button>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-[10px] font-semibold text-[#555A60]">
                Observação da revisão
              </span>

              <textarea
                value={
                  editNote
                }
                onChange={(
                  event,
                ) =>
                  setEditNote(
                    event.target.value.slice(
                      0,
                      500,
                    ),
                  )
                }
                disabled={
                  saving
                }
                rows={3}
                placeholder="Opcional. Ex.: parada causada por ajuste incorreto de operação."
                className="mt-2 w-full resize-none rounded-[12px] border border-[#DFE1E3] bg-white px-3 py-3 text-[11px] leading-5 text-[#34383C] outline-none transition focus:border-[#BFC3C7] disabled:bg-[#F7F7F6]"
              />

              <span className="mt-1 block text-right text-[9px] text-[#A1A5AA]">
                {editNote.length}/500
              </span>
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div>
                {editing.wasReviewed && (
                  <button
                    type="button"
                    onClick={() =>
                      void restorePrediction()
                    }
                    disabled={
                      saving
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] px-3 text-[10px] font-semibold text-[#777C82] transition hover:bg-[#F5F5F4] disabled:opacity-50"
                  >
                    <Undo2
                      size={14}
                    />

                    Restaurar previsão
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditing(
                      null,
                    )
                  }
                  disabled={
                    saving
                  }
                  className="h-11 rounded-[11px] border border-[#DFE1E3] px-4 text-[10px] font-semibold text-[#686D73] transition hover:bg-[#F7F7F6] disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void saveReview()
                  }
                  disabled={
                    saving
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-[#E41E2B] px-5 text-[10px] font-semibold text-white transition hover:bg-[#CF1824] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <LoaderCircle
                      size={14}
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2
                      size={14}
                    />
                  )}

                  Salvar revisão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FailureOriginAnalysis({
  data,
  startDate,
  endDate,
  line,
  equipment,
  onChanged,
}: FailureOriginAnalysisProps) {
  const [
    selectedOrigin,
    setSelectedOrigin,
  ] =
    useState<
      FailureOriginFilter | null
    >(null);

  return (
    <>
      <FailureOriginOverview
        data={
          data
        }
        onSelectOrigin={
          setSelectedOrigin
        }
      />

      <FailureOriginReviewDrawer
        origin={
          selectedOrigin
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
        onClose={() =>
          setSelectedOrigin(
            null,
          )
        }
        onChanged={
          onChanged
        }
      />
    </>
  );
}