"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";


/* =========================================================
   PROPS
========================================================= */

interface ReviewPageProps {
  user: {
    name: string;
  };

  unit: {
    city: string | null;
  };
}


/* =========================================================
   API TYPES
========================================================= */

interface ReviewSummary {
  total: number;

  pending: number;

  confirmed: number;

  corrected: number;

  discarded: number;

  reviewed: number;
}


interface FailureModeOption {
  id:
    | number
    | null;

  code: string;

  name: string;
}


interface TopPrediction {
  failedComponentCode: string;

  failureMode: string;

  confidence: number;

  decisionScore:
    | number
    | null;
}


interface ReviewItem {
  suggestionId: number;

  eventId: number;

  event: {
    date:
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

    stopKey1:
      | string
      | null;

    stopSubkey:
      | string
      | null;

    observation: string;

    downtimeMinutes:
      | number
      | null;
  };

  suggestion: {
    failedComponentCode: string;

    failureMode: string;

    modelVersion: string;

    topPredictions:
      TopPrediction[];

    decisionSource:
      | string
      | null;

    decisionMargin:
      | number
      | null;

    automationThreshold:
      | number
      | null;

    automationStatus:
      | string
      | null;

    confidenceType:
      | string
      | null;
  };
}


interface ReviewResponse {
  success: boolean;

  error?: string;

  message?: string;

  modelVersion?:
    | string
    | null;

  summary?: ReviewSummary;

  failureModes?:
    FailureModeOption[];

  items?:
    ReviewItem[];
}


interface PatchResponse {
  success: boolean;

  error?: string;

  message?: string;

  action?: string;

  suggestionStatus?: string;

  classification?:
    | {
        eventId: number;

        failureMode: string;

        failureModeCode: string;

        failureModeId:
          | number
          | null;

        status:
          | "APROVADA"
          | "CORRIGIDA";
      }
    | null;
}


/* =========================================================
   HELPERS
========================================================= */

function formatDate(
  value:
    | string
    | null,
): string {
  if (
    !value
  ) {
    return "—";
  }

  const normalized =
    /^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
      ? `${value}T12:00:00`
      : value;

  const date =
    new Date(
      normalized,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
  ).format(
    date,
  );
}


function formatNumber(
  value:
    | number
    | null
    | undefined,

  digits =
    4,
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      value,
    )
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "pt-BR",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits,
    },
  ).format(
    value,
  );
}


function normalizeFailureMode(
  value: string,
): string {
  return value
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toUpperCase()
    .replace(
      /[^A-Z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}


function sourceLabel(
  value:
    | string
    | null,
): string {
  if (
    value ===
    "RULE"
  ) {
    return "Regra determinística";
  }

  if (
    value ===
    "ML"
  ) {
    return "Classificador";
  }

  return (
    value ||
    "Não informada"
  );
}


function automationStatusLabel(
  value:
    | string
    | null,
): string {
  switch (
    value
  ) {
    case "HIGH_CONFIDENCE":
      return "Alta confiança";

    case "REVIEW_REQUIRED":
      return "Revisão necessária";

    case "RULE_HIGH_CONFIDENCE":
      return "Regra determinística";

    default:
      return (
        value ||
        "Não informado"
      );
  }
}


function automationStatusClass(
  value:
    | string
    | null,
): string {
  switch (
    value
  ) {
    case "HIGH_CONFIDENCE":
      return (
        "border-success/25 " +
        "bg-success/10 " +
        "text-success"
      );

    case "RULE_HIGH_CONFIDENCE":
      return (
        "border-chart-neutral/25 " +
        "bg-chart-neutral/10 " +
        "text-chart-neutral"
      );

    case "REVIEW_REQUIRED":
      return (
        "border-warning/25 " +
        "bg-warning/10 " +
        "text-warning"
      );

    default:
      return (
        "border-border-theme " +
        "bg-surface-elevated " +
        "text-text-secondary"
      );
  }
}


/* =========================================================
   COMPONENT
========================================================= */

export function ReviewPage({
  user,
  unit,
}: ReviewPageProps) {
  const [
    items,
    setItems,
  ] =
    useState<
      ReviewItem[]
    >(
      [],
    );

  const [
    summary,
    setSummary,
  ] =
    useState<ReviewSummary>({
      total:
        0,

      pending:
        0,

      confirmed:
        0,

      corrected:
        0,

      discarded:
        0,

      reviewed:
        0,
    });

  const [
    failureModes,
    setFailureModes,
  ] =
    useState<
      FailureModeOption[]
    >(
      [],
    );

  const [
    modelVersion,
    setModelVersion,
  ] =
    useState<
      string | null
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
    busy,
    setBusy,
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
    useState(
      false,
    );

  const [
    correctedFailureMode,
    setCorrectedFailureMode,
  ] =
    useState(
      "",
    );


  /* =======================================================
     CURRENT
  ======================================================= */

  const current =
    items[0] ??
    null;


  /* =======================================================
     PROGRESS
  ======================================================= */

  const progress =
    summary.total >
    0
      ? Math.round(
          (
            summary.reviewed /
            summary.total
          ) *
            100,
        )
      : 0;


  /* =======================================================
     SELECTED MODE
  ======================================================= */

  const selectedFailureMode =
    useMemo(
      () => {
        const selectedKey =
          normalizeFailureMode(
            correctedFailureMode,
          );

        if (
          !selectedKey
        ) {
          return null;
        }

        return (
          failureModes.find(
            (
              mode,
            ) =>
              normalizeFailureMode(
                mode.name,
              ) ===
              selectedKey,
          ) ??
          null
        );
      },
      [
        correctedFailureMode,
        failureModes,
      ],
    );


  const sameAsSuggestion =
    useMemo(
      () => {
        if (
          !current ||
          !selectedFailureMode
        ) {
          return false;
        }

        return (
          normalizeFailureMode(
            selectedFailureMode
              .name,
          ) ===
          normalizeFailureMode(
            current
              .suggestion
              .failureMode,
          )
        );
      },
      [
        current,
        selectedFailureMode,
      ],
    );


  /* =======================================================
     LOAD
  ======================================================= */

  const loadReviews =
    useCallback(
      async (
        replace =
          true,
      ) => {
        try {
          const response =
            await fetch(
              "/api/review?limit=50",
              {
                cache:
                  "no-store",
              },
            );

          const data =
            (await response.json()) as
              ReviewResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ??
              data.message ??
              "Não foi possível carregar as revisões.",
            );
          }

          if (
            data.summary
          ) {
            setSummary(
              data.summary,
            );
          }

          if (
            Array.isArray(
              data.failureModes,
            )
          ) {
            setFailureModes(
              data.failureModes,
            );
          }

          setModelVersion(
            typeof data
              .modelVersion ===
              "string"
              ? data.modelVersion
              : null,
          );

          const received =
            Array.isArray(
              data.items,
            )
              ? data.items
              : [];

          if (
            replace
          ) {
            setItems(
              received,
            );
          } else {
            setItems(
              (
                currentItems,
              ) => {
                const map =
                  new Map<
                    number,
                    ReviewItem
                  >();

                for (
                  const item of
                  currentItems
                ) {
                  map.set(
                    item.suggestionId,
                    item,
                  );
                }

                for (
                  const item of
                  received
                ) {
                  map.set(
                    item.suggestionId,
                    item,
                  );
                }

                return Array.from(
                  map.values(),
                );
              },
            );
          }

          setError(
            "",
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar as revisões.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );


  useEffect(
    () => {
      void loadReviews();
    },
    [
      loadReviews,
    ],
  );


  /* =======================================================
     START EDITING
  ======================================================= */

  function startEditing() {
    if (
      !current
    ) {
      return;
    }

    setCorrectedFailureMode(
      current
        .suggestion
        .failureMode,
    );

    setEditing(
      true,
    );

    setError(
      "",
    );
  }


  /* =======================================================
     REMOVE CURRENT
  ======================================================= */

  function removeCurrent(
    action:
      | "CONFIRM"
      | "CORRECT"
      | "DISCARD",
  ) {
    if (
      !current
    ) {
      return;
    }

    const currentSuggestionId =
      current
        .suggestionId;

    setItems(
      (
        currentItems,
      ) =>
        currentItems.filter(
          (
            item,
          ) =>
            item.suggestionId !==
            currentSuggestionId,
        ),
    );

    setSummary(
      (
        currentSummary,
      ) => ({
        ...currentSummary,

        pending:
          Math.max(
            currentSummary
              .pending -
              1,
            0,
          ),

        reviewed:
          currentSummary
            .reviewed +
          1,

        confirmed:
          action ===
          "CONFIRM"
            ? currentSummary
                .confirmed +
              1
            : currentSummary
                .confirmed,

        corrected:
          action ===
          "CORRECT"
            ? currentSummary
                .corrected +
              1
            : currentSummary
                .corrected,

        discarded:
          action ===
          "DISCARD"
            ? currentSummary
                .discarded +
              1
            : currentSummary
                .discarded,
      }),
    );

    setEditing(
      false,
    );

    setCorrectedFailureMode(
      "",
    );

    setError(
      "",
    );

    /*
     * Mantemos registros carregados
     * à frente para tornar a revisão fluida.
     */
    if (
      items.length <=
      10
    ) {
      void loadReviews(
        false,
      );
    }
  }


  /* =======================================================
     SUBMIT
  ======================================================= */

  async function submitReview(
    action:
      | "CONFIRM"
      | "CORRECT"
      | "DISCARD",
  ) {
    if (
      !current ||
      busy
    ) {
      return;
    }

    if (
      action ===
      "CORRECT"
    ) {
      if (
        !selectedFailureMode
      ) {
        setError(
          "Selecione um modo de falha pertencente à taxonomia.",
        );

        return;
      }

      if (
        sameAsSuggestion
      ) {
        setError(
          "Esse modo é igual à sugestão atual. Use Confirmar.",
        );

        return;
      }
    }

    if (
      action ===
      "DISCARD"
    ) {
      const confirmed =
        window.confirm(
          [
            "Descartar esta sugestão?",
            "",
            "Nenhuma classificação oficial será criada para este apontamento.",
          ].join(
            "\n",
          ),
        );

      if (
        !confirmed
      ) {
        return;
      }
    }

    setBusy(
      true,
    );

    setError(
      "",
    );

    try {
      const body:
        Record<
          string,
          unknown
        > = {
          suggestionId:
            current
              .suggestionId,

          action,
        };

      if (
        action ===
        "CORRECT" &&
        selectedFailureMode
      ) {
        body.correctedFailureMode =
          selectedFailureMode
            .name;
      }

      const response =
        await fetch(
          "/api/review",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                body,
              ),
          },
        );

      const data =
        (await response.json()) as
          PatchResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
          data.message ??
          "Não foi possível registrar a revisão.",
        );
      }

      removeCurrent(
        action,
      );
    } catch (
      reviewError
    ) {
      setError(
        reviewError instanceof
          Error
          ? reviewError.message
          : "Não foi possível registrar a revisão.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }


  /* =======================================================
     KEYBOARD
  ======================================================= */

  useEffect(
    () => {
      function handleKeyDown(
        event:
          KeyboardEvent,
      ) {
        const target =
          event.target as
            HTMLElement | null;

        const tag =
          target
            ?.tagName
            ?.toLowerCase();

        const isInput =
          tag ===
            "input" ||
          tag ===
            "select" ||
          tag ===
            "textarea";

        if (
          isInput ||
          busy ||
          !current
        ) {
          return;
        }

        if (
          event.key ===
            "Enter" &&
          !editing
        ) {
          event.preventDefault();

          void submitReview(
            "CONFIRM",
          );
        }

        if (
          event.key
            .toLowerCase() ===
            "e" &&
          !editing
        ) {
          event.preventDefault();

          startEditing();
        }

        if (
          event.key
            .toLowerCase() ===
            "d" &&
          !editing
        ) {
          event.preventDefault();

          void submitReview(
            "DISCARD",
          );
        }

        if (
          event.key ===
            "Escape" &&
          editing
        ) {
          event.preventDefault();

          setEditing(
            false,
          );

          setCorrectedFailureMode(
            "",
          );

          setError(
            "",
          );
        }
      }

      window.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      busy,
      current,
      editing,
    ],
  );


  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">

        <div className="flex items-center gap-3 text-[13px] text-text-secondary">

          <LoaderCircle
            size={18}
            className="animate-spin text-[#F40009]"
          />

          Carregando revisões...

        </div>

      </main>
    );
  }


  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="min-h-screen bg-surface-elevated">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-border-theme bg-surface">

        <div className="mx-auto flex h-[78px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">

          <Link
            href="/dashboard"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={70}
              priority
              className="h-auto max-h-[52px] w-auto max-w-[140px] object-contain"
            />
          </Link>


          <div className="hidden text-right sm:block">

            <p className="text-[13px] font-medium text-text-primary">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {unit.city}
              </p>
            )}

          </div>

        </div>

      </header>


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1040px] px-6 pb-24 pt-12 sm:px-8 lg:px-12 lg:pt-16">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft
            size={15}
            strokeWidth={1.8}
          />

          Voltar
        </Link>


        {/* =================================================
            TITLE
        ================================================== */}

        <div className="mt-10">

          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em] text-text-primary sm:text-[40px]">
            Revisão humana
          </h1>

          <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-text-secondary">
            Valide o modo de falha sugerido para cada apontamento.
            Confirmações e correções passam a compor o histórico
            oficial e preservam a rastreabilidade da decisão humana.
          </p>

        </div>


        {/* =================================================
            PROGRESS
        ================================================== */}

        <div className="mt-10 border-y border-border-theme py-6">

          <div className="flex items-end justify-between gap-6">

            <div>

              <p className="text-[11px] text-text-secondary">
                Progresso da revisão
              </p>

              <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-text-primary">
                {progress}%
              </p>

            </div>


            <div className="text-right">

              <p className="text-[12px] text-text-secondary">
                {summary.reviewed} revisadas
              </p>

              <p className="mt-1 text-[11px] text-text-secondary">
                {summary.pending} pendentes
              </p>

            </div>

          </div>


          <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-surface-hover">

            <div
              className="h-full rounded-full bg-[#F40009] transition-all duration-300"
              style={{
                width:
                  `${Math.min(
                    progress,
                    100,
                  )}%`,
              }}
            />

          </div>


          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-text-secondary">

            <span>
              Confirmadas:{" "}
              {summary.confirmed}
            </span>

            <span>
              Corrigidas:{" "}
              {summary.corrected}
            </span>

            <span>
              Descartadas:{" "}
              {summary.discarded}
            </span>

          </div>

        </div>


        {/* =================================================
            ERROR
        ================================================== */}

        {error && (
          <div className="mt-7 flex items-start gap-3 rounded-[12px] border border-error/25 bg-error/10 px-4 py-3">

            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-error"
            />

            <p className="text-[12px] leading-5 text-error">
              {error}
            </p>

          </div>
        )}


        {/* =================================================
            FINISHED
        ================================================== */}

        {!current && (
          <div className="mt-14 rounded-[18px] border border-border-theme px-7 py-12 text-center">

            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">

              <Check
                size={20}
                strokeWidth={2}
              />

            </div>


            <h2 className="mt-5 text-[17px] font-semibold text-text-primary">
              Revisões concluídas
            </h2>

            <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-6 text-text-secondary">
              Não existem outras sugestões pendentes de revisão
              para a versão atual do classificador.
            </p>


            <Link
              href="/dashboard/historico"
              className="mt-7 inline-flex items-center gap-2 text-[12px] font-semibold text-[#F40009]"
            >
              Ver histórico

              <ChevronRight
                size={14}
              />
            </Link>

          </div>
        )}


        {/* =================================================
            REVIEW
        ================================================== */}

        {current && (
          <div className="mt-10">

            {/* ===============================================
                EVENT
            ================================================ */}

            <div className="rounded-[18px] border border-border-theme bg-surface p-6 sm:p-8">

              <div className="flex flex-col gap-7">

                <div>

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      Ocorrência
                    </p>

                    <p className="text-[10px] text-text-secondary">
                      Evento #{current.eventId}
                    </p>

                  </div>


                  <p className="mt-3 text-[17px] font-medium leading-7 text-text-primary">
                    {current
                      .event
                      .observation ||
                      "Sem observação informada"}
                  </p>

                </div>


                <div className="grid gap-5 border-t border-border-theme pt-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Equipamento
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                        .event
                        .equipment ||
                        "Não informado"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Linha
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                        .event
                        .line ||
                        "Não informada"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Data
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {formatDate(
                        current
                          .event
                          .date,
                      )}
                    </p>

                  </div>

                </div>


                <div className="grid gap-5 border-t border-border-theme pt-6 sm:grid-cols-4">

                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Tipo de parada
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                        .event
                        .stopType ||
                        "Não informado"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Chave de parada
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                        .event
                        .stopKey1 ||
                        "Não informada"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Subchave
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                        .event
                        .stopSubkey ||
                        "Não informada"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Parada
                    </p>

                    <p className="mt-1.5 text-[12px] leading-5 text-text-primary">
                      {current
                          .event
                          .downtimeMinutes ===
                        null
                        ? "—"
                        : `${current
                            .event
                            .downtimeMinutes} min`}
                    </p>

                  </div>

                </div>

              </div>

            </div>


            {/* ===============================================
                SUGGESTION
            ================================================ */}

            {!editing && (
              <div className="mt-5 rounded-[18px] border border-border-theme bg-surface-elevated p-6 sm:p-8">

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>

                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      Modo de falha sugerido
                    </p>

                    <p className="mt-3 text-[24px] font-semibold leading-8 tracking-[-0.035em] text-text-primary">
                      {current
                        .suggestion
                        .failureMode ||
                        "Não identificado"}
                    </p>

                  </div>


                  <span
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${automationStatusClass(
                      current
                        .suggestion
                        .automationStatus,
                    )}`}
                  >
                    {automationStatusLabel(
                      current
                        .suggestion
                        .automationStatus,
                    )}
                  </span>

                </div>


                {/* ===========================================
                    DECISION DATA
                ============================================ */}

                <div className="mt-7 grid gap-5 border-t border-border-theme pt-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Origem da decisão
                    </p>

                    <p className="mt-1.5 text-[12px] font-medium text-text-primary">
                      {sourceLabel(
                        current
                          .suggestion
                          .decisionSource,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Margem de decisão
                    </p>

                    <p className="mt-1.5 text-[12px] font-medium text-text-primary">
                      {formatNumber(
                        current
                          .suggestion
                          .decisionMargin,
                        4,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Limite de alta confiança
                    </p>

                    <p className="mt-1.5 text-[12px] font-medium text-text-primary">
                      {formatNumber(
                        current
                          .suggestion
                          .automationThreshold,
                        4,
                      )}
                    </p>

                  </div>

                </div>


                {/* ===========================================
                    MARGIN VISUAL
                ============================================ */}

                {current
                    .suggestion
                    .decisionMargin !==
                  null &&
                  current
                    .suggestion
                    .automationThreshold !==
                  null && (
                    <div className="mt-5 rounded-[12px] border border-border-theme bg-surface px-4 py-3">

                      <div className="flex items-center justify-between gap-4">

                        <p className="text-[10px] text-text-secondary">
                          Comparação com o limite
                        </p>

                        <p className="text-[11px] font-medium text-text-primary">
                          {current
                              .suggestion
                              .decisionMargin >=
                            current
                              .suggestion
                              .automationThreshold
                            ? "Acima do limite"
                            : "Abaixo do limite"}
                        </p>

                      </div>

                      <p className="mt-2 text-[10px] leading-5 text-text-secondary">
                        A margem é a diferença entre os dois maiores
                        scores do classificador. Ela não representa
                        uma probabilidade.
                      </p>

                    </div>
                )}


                {/* ===========================================
                    TOP 3
                ============================================ */}

                {current
                    .suggestion
                    .topPredictions
                    .length >
                  0 && (
                    <div className="mt-6 border-t border-border-theme pt-5">

                      <p className="text-[10px] text-text-secondary">
                        Ranking de hipóteses
                      </p>

                      <div className="mt-3 space-y-2">

                        {current
                          .suggestion
                          .topPredictions
                          .slice(
                            0,
                            3,
                          )
                          .map(
                            (
                              prediction,
                              index,
                            ) => (
                              <div
                                key={`${prediction.failedComponentCode}-${index}`}
                                className="flex items-center gap-4 rounded-[10px] border border-border-theme bg-surface px-4 py-3"
                              >

                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-semibold text-text-secondary">
                                  {index + 1}
                                </div>


                                <div className="min-w-0 flex-1">

                                  <p className="truncate text-[11px] font-medium text-text-primary">
                                    {prediction
                                      .failureMode}
                                  </p>

                                  {prediction
                                      .decisionScore !==
                                    null && (
                                      <p className="mt-1 text-[9px] text-text-secondary">
                                        Score:{" "}
                                        {formatNumber(
                                          prediction
                                            .decisionScore,
                                          4,
                                        )}
                                      </p>
                                  )}

                                </div>

                              </div>
                            ),
                          )}

                      </div>

                      <p className="mt-3 text-[9px] leading-4 text-text-secondary">
                        Os scores servem para ordenação das hipóteses
                        e não são probabilidades.
                      </p>

                    </div>
                )}


                {/* ===========================================
                    AUDIT
                ============================================ */}

                <div className="mt-6 border-t border-border-theme pt-5">

                  <div className="grid gap-4 sm:grid-cols-2">

                    <div>

                      <p className="text-[9px] text-text-secondary">
                        Versão do classificador
                      </p>

                      <p className="mt-1 break-all text-[10px] leading-5 text-text-secondary">
                        {current
                          .suggestion
                          .modelVersion ||
                          modelVersion ||
                          "—"}
                      </p>

                    </div>


                    <div>

                      <p className="text-[9px] text-text-secondary">
                        Código técnico
                      </p>

                      <p className="mt-1 break-all text-[10px] leading-5 text-text-secondary">
                        {current
                          .suggestion
                          .failedComponentCode ||
                          "—"}
                      </p>

                    </div>

                  </div>

                </div>


                <div className="mt-5 border-t border-border-theme pt-5">

                  <p className="text-[10px] leading-5 text-text-secondary">
                    A sugestão ainda não é uma classificação humana
                    oficial. Confirme, corrija ou descarte antes de
                    utilizá-la como referência validada.
                  </p>

                </div>

              </div>
            )}


            {/* ===============================================
                EDITOR
            ================================================ */}

            {editing && (
              <div className="mt-5 rounded-[18px] border border-border-theme bg-surface-elevated p-6 sm:p-8">

                <div className="flex items-center gap-2">

                  <Pencil
                    size={15}
                    strokeWidth={1.8}
                    className="text-text-secondary"
                  />

                  <p className="text-[12px] font-semibold text-text-primary">
                    Corrigir modo de falha
                  </p>

                </div>


                <div className="mt-7">

                  <label
                    htmlFor="corrected-failure-mode"
                    className="text-[11px] font-medium text-text-secondary"
                  >
                    Modo de falha correto
                  </label>

                  <input
                    id="corrected-failure-mode"
                    type="text"
                    list="failure-mode-options"
                    autoFocus
                    autoComplete="off"
                    value={
                      correctedFailureMode
                    }
                    onChange={(
                      event,
                    ) =>
                      setCorrectedFailureMode(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Pesquise um modo de falha..."
                    className="mt-2 h-11 w-full rounded-[10px] border border-border-theme bg-surface px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                  />

                  <datalist
                    id="failure-mode-options"
                  >
                    {failureModes.map(
                      (
                        mode,
                      ) => (
                        <option
                          key={`${mode.code}-${mode.name}`}
                          value={mode.name}
                        />
                      ),
                    )}
                  </datalist>


                  <p className="mt-2 text-[10px] leading-5 text-text-secondary">
                    Utilize uma nomenclatura existente na taxonomia.
                    Isso evita recriar duplicatas durante a revisão.
                  </p>

                </div>


                {/* ===========================================
                    QUICK ALTERNATIVES
                ============================================ */}

                {current
                    .suggestion
                    .topPredictions
                    .some(
                      (
                        prediction,
                      ) =>
                        normalizeFailureMode(
                          prediction
                            .failureMode,
                        ) !==
                        normalizeFailureMode(
                          current
                            .suggestion
                            .failureMode,
                        ),
                    ) && (
                    <div className="mt-6">

                      <p className="text-[10px] text-text-secondary">
                        Alternativas sugeridas
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">

                        {current
                          .suggestion
                          .topPredictions
                          .filter(
                            (
                              prediction,
                            ) =>
                              normalizeFailureMode(
                                prediction
                                  .failureMode,
                              ) !==
                              normalizeFailureMode(
                                current
                                  .suggestion
                                  .failureMode,
                              ),
                          )
                          .slice(
                            0,
                            3,
                          )
                          .map(
                            (
                              prediction,
                            ) => (
                              <button
                                key={
                                  prediction
                                    .failedComponentCode
                                }
                                type="button"
                                onClick={() =>
                                  setCorrectedFailureMode(
                                    prediction
                                      .failureMode,
                                  )
                                }
                                className="rounded-full border border-border-theme bg-surface px-3 py-2 text-[10px] font-medium text-text-secondary transition-colors hover:border-border-theme hover:bg-surface-hover"
                              >
                                {prediction
                                  .failureMode}
                              </button>
                            ),
                          )}

                      </div>

                    </div>
                )}


                {/* ===========================================
                    SELECTED MODE
                ============================================ */}

                <div className="mt-6 border-y border-border-theme py-5">

                  <p className="text-[10px] text-text-secondary">
                    Classificação resultante
                  </p>

                  <p className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-text-primary">
                    {selectedFailureMode
                      ?.name ||
                      "Selecione um modo válido"}
                  </p>

                  {selectedFailureMode && (
                    <p className="mt-2 text-[9px] text-text-secondary">
                      Código:{" "}
                      {selectedFailureMode
                        .code}
                    </p>
                  )}

                </div>


                {sameAsSuggestion && (
                  <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-border-theme bg-surface px-4 py-3">

                    <AlertCircle
                      size={15}
                      className="mt-0.5 shrink-0 text-text-secondary"
                    />

                    <p className="text-[10px] leading-5 text-text-secondary">
                      O modo selecionado é igual à sugestão atual.
                      Nesse caso, use Confirmar em vez de salvar
                      uma correção.
                    </p>

                  </div>
                )}


                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={() => {
                      setEditing(
                        false,
                      );

                      setCorrectedFailureMode(
                        "",
                      );

                      setError(
                        "",
                      );
                    }}
                    className="rounded-[10px] border border-border-theme bg-surface px-5 py-3 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    Cancelar
                  </button>


                  <button
                    type="button"
                    disabled={
                      busy ||
                      !selectedFailureMode ||
                      sameAsSuggestion
                    }
                    onClick={() =>
                      void submitReview(
                        "CORRECT",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#F40009] px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#D90008] disabled:opacity-50"
                  >

                    {busy && (
                      <LoaderCircle
                        size={14}
                        className="animate-spin"
                      />
                    )}

                    Salvar correção

                  </button>

                </div>

              </div>
            )}


            {/* ===============================================
                MAIN ACTIONS
            ================================================ */}

            {!editing && (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={() =>
                    void submitReview(
                      "DISCARD",
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-border-theme bg-surface px-5 py-3 text-[12px] font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                >
                  <Trash2
                    size={14}
                    strokeWidth={1.8}
                  />

                  Descartar
                </button>


                <div className="flex flex-col-reverse gap-3 sm:flex-row">

                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={
                      startEditing
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-border-theme bg-surface px-6 py-3 text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    <Pencil
                      size={15}
                      strokeWidth={1.8}
                    />

                    Corrigir
                  </button>


                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      void submitReview(
                        "CONFIRM",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#F40009] px-7 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#D90008] disabled:opacity-60"
                  >

                    {busy ? (
                      <LoaderCircle
                        size={15}
                        className="animate-spin"
                      />
                    ) : (
                      <Check
                        size={15}
                        strokeWidth={2}
                      />
                    )}

                    Confirmar

                  </button>

                </div>

              </div>
            )}


            {!editing && (
              <p className="mt-5 text-right text-[10px] text-text-secondary">
                Enter confirma · E corrige · D descarta
              </p>
            )}

          </div>
        )}

      </section>

    </main>
  );
}