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

  reviewed: number;
}


interface TopPrediction {
  failedComponentCode: string;

  failureMode: string;

  confidence: number;
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

    confidence: number;

    modelVersion: string;

    topPredictions:
      TopPrediction[];
  };
}


interface ReviewResponse {
  success: boolean;

  error?: string;

  message?: string;

  summary?: ReviewSummary;

  items?: ReviewItem[];
}


interface PatchResponse {
  success: boolean;

  error?: string;

  message?: string;

  classification?: {
    eventId: number;

    failedComponentCode: string;

    failureMode: string;

    status:
      | "APROVADA"
      | "CORRIGIDA";
  };
}


interface BulkAcceptResponse {
  success: boolean;

  error?: string;

  message?: string;

  accepted?: number;

  summary?: ReviewSummary;
}


/* =========================================================
   HELPERS
========================================================= */

function formatDate(
  value:
    | string
    | null,
) {
  if (!value) {
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


function formatConfidence(
  value:
    | number
    | null
    | undefined,
) {
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


  return `${Math.round(
    value * 100,
  )}%`;
}


function suggestedComponentName(
  item:
    ReviewItem,
) {
  const fromMode =
    item
      .suggestion
      .failureMode
      ?.replace(
        /^Falha\s+de\s+/i,
        "",
      )
      .trim();


  if (fromMode) {
    return fromMode;
  }


  return item
    .suggestion
    .failedComponentCode
    .toLowerCase()
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
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
    >([]);


  const [
    summary,
    setSummary,
  ] =
    useState<ReviewSummary>({
      total: 0,

      pending: 0,

      confirmed: 0,

      corrected: 0,

      reviewed: 0,
    });


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    busy,
    setBusy,
  ] =
    useState(false);



  const [
    acceptingAll,
    setAcceptingAll,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    editing,
    setEditing,
  ] =
    useState(false);


  const [
    correctedComponent,
    setCorrectedComponent,
  ] =
    useState("");


  /* =======================================================
     ATUAL
  ======================================================= */

  const current =
    items[0] ??
    null;


  /* =======================================================
     PROGRESSO
  ======================================================= */

  const progress =
    summary.total > 0
      ? Math.round(
          (
            summary.reviewed /
            summary.total
          ) *
            100,
        )
      : 0;


  /* =======================================================
     PREVIEW DA CORREÇÃO
  ======================================================= */

  const correctedFailureMode =
    useMemo(
      () => {
        const component =
          correctedComponent
            .trim()
            .replace(
              /\s+/g,
              " ",
            )
            .replace(
              /^falha\s+de\s+/i,
              "",
            )
            .trim();


        return component
          ? `Falha de ${component}`
          : "Informe o componente correto";
      },
      [
        correctedComponent,
      ],
    );


  /* =======================================================
     LOAD
  ======================================================= */

  const loadReviews =
    useCallback(
      async (
        replace = true,
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


          const received =
            Array.isArray(
              data.items,
            )
              ? data.items
              : [];


          if (replace) {
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
     ABRIR EDIÇÃO
  ======================================================= */

  function startEditing() {
    if (!current) {
      return;
    }


    setCorrectedComponent(
      suggestedComponentName(
        current,
      ),
    );


    setEditing(
      true,
    );
  }


  /* =======================================================
     REMOVE ITEM LOCAL
  ======================================================= */

  function removeCurrent(
    action:
      | "CONFIRM"
      | "CORRECT",
  ) {
    if (!current) {
      return;
    }


    const currentSuggestionId =
      current.suggestionId;


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
            currentSummary.pending -
              1,
            0,
          ),

        reviewed:
          currentSummary.reviewed +
          1,

        confirmed:
          action ===
          "CONFIRM"
            ? currentSummary.confirmed +
              1
            : currentSummary.confirmed,

        corrected:
          action ===
          "CORRECT"
            ? currentSummary.corrected +
              1
            : currentSummary.corrected,
      }),
    );


    setEditing(
      false,
    );

    setCorrectedComponent(
      "",
    );


    /*
     * Mantemos um buffer de registros.
     * Quando cair abaixo de 10, buscamos mais
     * em segundo plano.
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
     PATCH
  ======================================================= */

  async function submitReview(
    action:
      | "CONFIRM"
      | "CORRECT",
  ) {
    if (
      !current ||
      busy
    ) {
      return;
    }


    const cleanedComponent =
      correctedComponent
        .trim()
        .replace(
          /\s+/g,
          " ",
        )
        .replace(
          /^falha\s+de\s+/i,
          "",
        )
        .trim();


    if (
      action ===
        "CORRECT" &&
      cleanedComponent.length <
        2
    ) {
      setError(
        "Informe o componente correto.",
      );

      return;
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
            current.suggestionId,

          action,
        };


      if (
        action ===
        "CORRECT"
      ) {
        body.correctedComponent =
          cleanedComponent;
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
     ACEITAR TODAS TEMPORARIAMENTE
  ======================================================= */

  async function acceptAllTemporarily() {
    if (
      acceptingAll ||
      busy ||
      summary.pending <= 0
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        [
          `Aceitar temporariamente as ${summary.pending} sugestões pendentes?`,
          "",
          "Elas serão liberadas para uso nos dados agora,",
          "mas continuarão marcadas internamente como aceitação temporária",
          "e não devem ser usadas como rótulos humanos no treinamento.",
        ].join(
          "\n",
        ),
      );


    if (!confirmed) {
      return;
    }


    setAcceptingAll(
      true,
    );

    setError(
      "",
    );


    try {
      const response =
        await fetch(
          "/api/review/accept-all",
          {
            method:
              "POST",
          },
        );


      const data =
        (await response.json()) as
          BulkAcceptResponse;


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            data.message ??
            "Não foi possível aceitar todas as sugestões.",
        );
      }


      setEditing(
        false,
      );

      setCorrectedComponent(
        "",
      );

      setItems(
        [],
      );


      if (
        data.summary
      ) {
        setSummary(
          data.summary,
        );
      } else {
        await loadReviews(
          true,
        );
      }
    } catch (
      bulkError
    ) {
      setError(
        bulkError instanceof
          Error
          ? bulkError.message
          : "Não foi possível aceitar todas as sugestões.",
      );
    } finally {
      setAcceptingAll(
        false,
      );
    }
  }


  /* =======================================================
     TECLADO
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
          target?.tagName
            ?.toLowerCase();


        const isInput =
          tag === "input" ||
          tag === "select" ||
          tag === "textarea";


        if (
          isInput ||
          busy ||
          acceptingAll ||
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
          event.key ===
            "Escape" &&
          editing
        ) {
          event.preventDefault();

          setEditing(
            false,
          );

          setCorrectedComponent(
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
      acceptingAll,
      current,
      editing,
    ],
  );


  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">

        <div className="flex items-center gap-3 text-[13px] text-[#777C82]">

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
    <main className="min-h-screen bg-white">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-[#E8E9EB] bg-white">

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

            <p className="text-[13px] font-medium text-[#2D3034]">
              {user.name}
            </p>


            {unit.city && (
              <p className="mt-0.5 text-[11px] text-[#979BA1]">
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
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
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

          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
            Revisão humana
          </h1>


          <p className="mt-3 max-w-[680px] text-[14px] leading-7 text-[#7D8288]">
            Confirme ou corrija as sugestões do Modelo ML.
            Somente classificações revisadas por uma pessoa
            são registradas como oficiais e podem servir de
            referência para evolução futura do modelo.
          </p>

        </div>


        {/* =================================================
            PROGRESS
        ================================================== */}

        <div className="mt-10 border-y border-[#E9EBED] py-6">

          <div className="flex items-end justify-between gap-6">

            <div>

              <p className="text-[11px] text-[#979BA1]">
                Progresso da revisão
              </p>


              <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#292C30]">
                {progress}%
              </p>

            </div>


            <div className="text-right">

              <p className="text-[12px] text-[#73787E]">
                {summary.reviewed} revisadas
              </p>


              <p className="mt-1 text-[11px] text-[#A0A4A9]">
                {summary.pending} pendentes
              </p>

            </div>

          </div>


          <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#ECEEEF]">

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


          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-[#A0A4A9]">

            <span>
              Confirmadas:{" "}
              {summary.confirmed}
            </span>

            <span>
              Corrigidas:{" "}
              {summary.corrected}
            </span>

          </div>


          {summary.pending > 0 && (
            <div className="mt-5 flex flex-col gap-2 border-t border-[#ECEDEF] pt-5 sm:flex-row sm:items-center sm:justify-between">

              <p className="max-w-[610px] text-[10px] leading-5 text-[#9A9EA3]">
                Uso temporário: aceita todas as sugestões pendentes para liberar os dados.
                Essas classificações são registradas como aceitação em lote e não como revisão humana individual.
              </p>


              <button
                type="button"
                disabled={
                  acceptingAll ||
                  busy
                }
                onClick={() =>
                  void acceptAllTemporarily()
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#D9DCE0] bg-white px-5 py-2.5 text-[11px] font-semibold text-[#4A4F55] transition-colors hover:bg-[#F8F8F9] disabled:opacity-50"
              >
                {acceptingAll && (
                  <LoaderCircle
                    size={14}
                    className="animate-spin"
                  />
                )}

                Aceitar tudo temporariamente
              </button>

            </div>
          )}

        </div>


        {/* =================================================
            ERROR
        ================================================== */}

        {error && (
          <div className="mt-7 flex items-start gap-3 rounded-[12px] border border-[#F0D2D4] bg-[#FFF9F9] px-4 py-3">

            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-[#C92A32]"
            />


            <p className="text-[12px] leading-5 text-[#6F3D40]">
              {error}
            </p>

          </div>
        )}


        {/* =================================================
            FINISHED
        ================================================== */}

        {!current && (
          <div className="mt-14 rounded-[18px] border border-[#E4E6E8] px-7 py-12 text-center">

            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F7F3] text-[#238636]">

              <Check
                size={20}
                strokeWidth={2}
              />

            </div>


            <h2 className="mt-5 text-[17px] font-semibold text-[#292C30]">
              Revisões concluídas
            </h2>


            <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-6 text-[#858A90]">
              Não existem outras sugestões do Modelo ML
              pendentes de revisão neste momento.
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
            REVIEW CARD
        ================================================== */}

        {current && (
          <div className="mt-10">

            {/* ===============================================
                EVENT
            ================================================ */}

            <div className="rounded-[18px] border border-[#E3E5E7] bg-white p-6 sm:p-8">

              <div className="flex flex-col gap-7">

                <div>

                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A4A9]">
                    Ocorrência
                  </p>


                  <p className="mt-3 text-[17px] font-medium leading-7 text-[#24272B]">
                    {current
                      .event
                      .observation ||
                      "Sem observação informada"}
                  </p>

                </div>


                <div className="grid gap-5 border-t border-[#ECEDEF] pt-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Equipamento
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {current
                        .event
                        .equipment ||
                        "Não informado"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Linha
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {current
                        .event
                        .line ||
                        "Não informada"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Data
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {formatDate(
                        current
                          .event
                          .date,
                      )}
                    </p>

                  </div>

                </div>


                <div className="grid gap-5 border-t border-[#ECEDEF] pt-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Tipo de parada
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {current
                        .event
                        .stopType ||
                        "Não informado"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Chave de parada
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {current
                        .event
                        .stopKey1 ||
                        "Não informada"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#A0A4A9]">
                      Minutos de parada
                    </p>


                    <p className="mt-1.5 text-[12px] leading-5 text-[#52575D]">
                      {current
                          .event
                          .downtimeMinutes ===
                        null
                        ? "—"
                        : current
                            .event
                            .downtimeMinutes}
                    </p>

                  </div>

                </div>

              </div>

            </div>


            {/* ===============================================
                SUGGESTION
            ================================================ */}

            {!editing && (
              <div className="mt-5 rounded-[18px] border border-[#E3E5E7] bg-[#FBFBFC] p-6 sm:p-8">

                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A4A9]">
                  Sugestão do Modelo ML
                </p>


                {/* ===========================================
                    FAILURE MODE — PRINCIPAL
                ============================================ */}

                <div className="mt-6">

                  <p className="text-[11px] text-[#969BA1]">
                    O que falhou?
                  </p>


                  <p className="mt-2 text-[24px] font-semibold leading-8 tracking-[-0.035em] text-[#202327]">
                    {current
                      .suggestion
                      .failureMode ||
                      "Não identificado"}
                  </p>

                </div>


                {/* ===========================================
                    SECONDARY DATA
                ============================================ */}

                <div className="mt-7 grid gap-5 border-t border-[#E6E8EA] pt-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[10px] text-[#9A9EA3]">
                      Código interno
                    </p>


                    <p className="mt-1.5 text-[12px] font-medium text-[#51565C]">
                      {current
                        .suggestion
                        .failedComponentCode ||
                        "NAO_IDENTIFICADO"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#9A9EA3]">
                      Confiança do modelo
                    </p>


                    <p className="mt-1.5 text-[12px] font-medium text-[#51565C]">
                      {formatConfidence(
                        current
                          .suggestion
                          .confidence,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-[#9A9EA3]">
                      Versão
                    </p>


                    <p className="mt-1.5 text-[12px] font-medium text-[#51565C]">
                      {current
                        .suggestion
                        .modelVersion ||
                        "Não informada"}
                    </p>

                  </div>

                </div>


                {current
                    .suggestion
                    .topPredictions
                    .length >
                  1 && (
                  <div className="mt-6 border-t border-[#E6E8EA] pt-5">

                    <p className="text-[10px] text-[#9A9EA3]">
                      Outras hipóteses do modelo
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
                              className="flex items-center justify-between gap-4 text-[11px]"
                            >
                              <span className="min-w-0 truncate text-[#60656B]">
                                {prediction.failureMode}
                              </span>

                              <span className="shrink-0 text-[#9A9EA3]">
                                {formatConfidence(
                                  prediction.confidence,
                                )}
                              </span>
                            </div>
                          ),
                        )}

                    </div>

                  </div>
                )}


                <div className="mt-5 border-t border-[#E6E8EA] pt-5">

                  <p className="text-[10px] leading-5 text-[#A1A5AA]">
                    A sugestão acima ainda não é uma classificação
                    oficial. Ela só será registrada após sua
                    confirmação ou correção.
                  </p>

                </div>

              </div>
            )}


            {/* ===============================================
                EDITOR
            ================================================ */}

            {editing && (
              <div className="mt-5 rounded-[18px] border border-[#E3E5E7] bg-[#FBFBFC] p-6 sm:p-8">

                <div className="flex items-center gap-2">

                  <Pencil
                    size={15}
                    strokeWidth={1.8}
                    className="text-[#74797F]"
                  />


                  <p className="text-[12px] font-semibold text-[#41464C]">
                    Corrigir classificação
                  </p>

                </div>


                <div className="mt-7">

                  <label
                    htmlFor="corrected-component"
                    className="text-[11px] font-medium text-[#676C72]"
                  >
                    Componente correto
                  </label>


                  <input
                    id="corrected-component"
                    type="text"
                    autoFocus
                    value={
                      correctedComponent
                    }
                    onChange={(
                      event,
                    ) =>
                      setCorrectedComponent(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Ex.: rolamento, sensor, bomba, datadora"
                    className="mt-2 h-11 w-full rounded-[10px] border border-[#D8DBDE] bg-white px-3 text-[13px] text-[#32363A] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#AEB2B7]"
                  />


                  <p className="mt-2 text-[10px] leading-5 text-[#A0A4A9]">
                    Informe o componente que efetivamente falhou.
                    O sistema criará o código interno e o modo de
                    falha correspondente.
                  </p>

                </div>


                <div className="mt-6 border-y border-[#E5E7E9] py-5">

                  <p className="text-[10px] text-[#999DA2]">
                    Classificação resultante
                  </p>


                  <p className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[#24272B]">
                    {correctedFailureMode}
                  </p>

                </div>


                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                  <button
                    type="button"
                    disabled={
                      busy ||
                      acceptingAll
                    }
                    onClick={() => {
                      setEditing(
                        false,
                      );

                      setCorrectedComponent(
                        "",
                      );

                      setError(
                        "",
                      );
                    }}
                    className="rounded-[10px] border border-[#D8DBDE] bg-white px-5 py-3 text-[12px] font-semibold text-[#666B71] transition-colors hover:bg-[#F7F7F8] disabled:opacity-50"
                  >
                    Cancelar
                  </button>


                  <button
                    type="button"
                    disabled={
                      busy ||
                      correctedComponent
                        .trim()
                        .length <
                        2
                    }
                    onClick={() =>
                      void submitReview(
                        "CORRECT",
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#F40009] px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#D90008] disabled:opacity-60"
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
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    startEditing
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#D9DCE0] bg-white px-6 py-3 text-[13px] font-semibold text-[#4A4F55] transition-colors hover:bg-[#F8F8F9] disabled:opacity-50"
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
            )}


            {!editing && (
              <p className="mt-5 text-right text-[10px] text-[#A1A5AA]">
                Enter confirma · E corrige
              </p>
            )}

          </div>
        )}

      </section>

    </main>
  );
}
