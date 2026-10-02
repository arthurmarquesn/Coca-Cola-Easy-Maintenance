"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CirclePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FiveWhysTree,
  type FiveWhyNode,
} from "@/components/masp/five-whys-tree";

import {
  IshikawaBoard,
} from "@/components/masp/ishikawa-board";

import {
  MaspShell,
} from "@/components/masp/masp-shell";

import {
  readApiResponse,
} from "@/components/masp/types";

import {
  MASP_CATEGORIES,
  type MaspCategory,
} from "@/lib/masp/domain";


interface Hypothesis {
  id: number;
  category: MaspCategory;
  description: string;
  status: string;
  source: string;
  support_count: number;
}

interface RootCause {
  id: number;
  description: string;
  status: string;
  evidence_summary:
    | string
    | null;
  hypothesis_id:
    | number
    | null;
  five_why_id:
    | number
    | null;
}

interface MaspAction {
  id: number;
  root_cause_id:
    | number
    | null;
  what: string;
  why:
    | string
    | null;
  where_text:
    | string
    | null;
  when_date:
    | string
    | null;
  who_text:
    | string
    | null;
  who_user_name:
    | string
    | null;
  how_text:
    | string
    | null;
  how_much_text:
    | string
    | null;
  status: string;
  completed_at:
    | string
    | null;
}

interface Verification {
  id: number;
  baseline_start:
    | string
    | null;
  baseline_end:
    | string
    | null;
  verification_start: string;
  verification_end:
    | string
    | null;
  event_count_before:
    | number
    | null;
  event_count_after:
    | number
    | null;
  downtime_before_minutes:
    | number
    | string
    | null;
  downtime_after_minutes:
    | number
    | string
    | null;
  recurrence_detected:
    | number
    | boolean;
  notes:
    | string
    | null;
  verified_at: string;
}

interface MaspDetailResponse {
  success: boolean;
  message?: string;
  analysis: {
    id: number;
    unit_id: number;
    unit_name: string;
    equipment_id:
      | number
      | null;
    equipment_name:
      | string
      | null;
    line_name:
      | string
      | null;
    owner_name:
      | string
      | null;
    title: string;
    problem_statement: string;
    status: string;
    verification_days: number;
    updated_at: string;
  };
  summary: {
    eventCount: number;
    firstOccurrence:
      | string
      | null;
    lastOccurrence:
      | string
      | null;
    downtimeTotalMinutes: number;
    downtimeAverageMinutes: number;
    equipment:
      | string
      | null;
    line:
      | string
      | null;
    component:
      | string
      | null;
    failureMode:
      | string
      | null;
    failureOrigin:
      | string
      | null;
    frequentShifts: string[];
  };
  events: Array<{
    id: number;
    event_date: string;
    equipment_name:
      | string
      | null;
    observation:
      | string
      | null;
    downtime_minutes:
      | number
      | string
      | null;
    relation_type: string;
  }>;
  hypotheses: Hypothesis[];
  fiveWhys: FiveWhyNode[];
  rootCauses: RootCause[];
  evidence: Array<{
    id: number;
    type: string;
    description: string;
    event_id:
      | number
      | null;
    created_by_name: string;
  }>;
  actions: MaspAction[];
  verifications: Verification[];
}

interface Suggestion {
  category: MaspCategory;
  description: string;
  supportCount: number;
  source: "HISTORY";
  sampleEventIds: number[];
}

const TABS = [
  "Problema",
  "Brainstorming / Ishikawa",
  "5 Porquês",
  "Causa Raiz",
  "Plano de Ação",
  "Verificação",
] as const;

const NEXT_STATUS:
Record<string, string | null> = {
  DRAFT:
    "ANALYSIS",
  ANALYSIS:
    "ROOT_CAUSE",
  ROOT_CAUSE:
    "ACTION_PLAN",
  ACTION_PLAN:
    "EXECUTION",
  EXECUTION:
    "VERIFICATION",
  VERIFICATION:
    "CLOSED",
  CLOSED:
    null,
  CANCELLED:
    null,
};

const STATUS_LABELS:
Record<string, string> = {
  DRAFT:
    "Rascunho",
  ANALYSIS:
    "Em análise",
  ROOT_CAUSE:
    "Causa raiz",
  ACTION_PLAN:
    "Plano de ação",
  EXECUTION:
    "Execução",
  VERIFICATION:
    "Verificação",
  CLOSED:
    "Encerrado",
  CANCELLED:
    "Cancelado",
};

const CATEGORY_LABELS:
Record<MaspCategory, string> = {
  MAQUINA:
    "Máquina",
  METODO:
    "Método",
  MAO_DE_OBRA:
    "Mão de obra",
  MATERIAL:
    "Material",
  MEDICAO:
    "Medição",
  MEIO_AMBIENTE:
    "Meio ambiente",
};

const inputClass =
  "h-11 w-full rounded-[11px] border border-[#E1E3E5] bg-white px-3 text-[12px] text-[#44494F] outline-none focus:border-[#D58B91]";

const textareaClass =
  "w-full rounded-[11px] border border-[#E1E3E5] bg-white px-3 py-3 text-[12px] leading-5 text-[#44494F] outline-none focus:border-[#D58B91]";

function MethodCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#E4E6E8] bg-white p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-[#303438]">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-[11px] leading-5 text-[#92979D]">
          {description}
        </p>
      )}
      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function metric(
  value:
    | number
    | string
    | null,
  suffix =
    "",
): string {
  const number =
    Number(
      value ?? 0,
    );

  return `${Number.isFinite(number) ? number.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  }) : "0"}${suffix}`;
}

export function MaspDetailPage({
  userName,
  maspId,
}: {
  userName: string;
  maspId: number;
}) {
  const [
    data,
    setData,
  ] =
    useState<
      MaspDetailResponse | null
    >(null);
  const [
    suggestions,
    setSuggestions,
  ] =
    useState<
      Suggestion[]
    >([]);
  const [
    activeTab,
    setActiveTab,
  ] =
    useState(
      0,
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
    notice,
    setNotice,
  ] =
    useState(
      "",
    );
  const [
    title,
    setTitle,
  ] =
    useState(
      "",
    );
  const [
    statement,
    setStatement,
  ] =
    useState(
      "",
    );
  const [
    eventId,
    setEventId,
  ] =
    useState(
      "",
    );
  const [
    hypothesisCategory,
    setHypothesisCategory,
  ] =
    useState<MaspCategory>(
      "MAQUINA",
    );
  const [
    hypothesisDescription,
    setHypothesisDescription,
  ] =
    useState(
      "",
    );
  const [
    selectedHypothesisId,
    setSelectedHypothesisId,
  ] =
    useState<
      number | null
    >(null);
  const [
    whyParentId,
    setWhyParentId,
  ] =
    useState(
      "",
    );
  const [
    whyAnswer,
    setWhyAnswer,
  ] =
    useState(
      "",
    );
  const [
    whyWarnings,
    setWhyWarnings,
  ] =
    useState<
      string[]
    >([]);
  const [
    causeDescription,
    setCauseDescription,
  ] =
    useState(
      "",
    );
  const [
    causeEvidenceSummary,
    setCauseEvidenceSummary,
  ] =
    useState(
      "",
    );
  const [
    causeFiveWhyId,
    setCauseFiveWhyId,
  ] =
    useState(
      "",
    );
  const [
    evidenceType,
    setEvidenceType,
  ] =
    useState(
      "TEXT",
    );
  const [
    evidenceDescription,
    setEvidenceDescription,
  ] =
    useState(
      "",
    );
  const [
    evidenceEventId,
    setEvidenceEventId,
  ] =
    useState(
      "",
    );
  const [
    actionForm,
    setActionForm,
  ] =
    useState({
      rootCauseId:
        "",
      what:
        "",
      why:
        "",
      whereText:
        "",
      whenDate:
        "",
      whoText:
        "",
      howText:
        "",
      howMuchText:
        "",
    });
  const [
    verificationForm,
    setVerificationForm,
  ] =
    useState({
      baselineStart:
        "",
      baselineEnd:
        "",
      verificationStart:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),
      verificationEnd:
        "",
      notes:
        "",
    });

  const load =
    useCallback(
      async () => {
        setLoading(
          true,
        );
        setError(
          "",
        );

        try {
          const result =
            await fetch(
              `/api/masp/${maspId}`,
              {
                cache:
                  "no-store",
              },
            ).then(
              (
                response,
              ) =>
                readApiResponse<MaspDetailResponse>(
                  response,
                ),
            );

          setData(
            result,
          );
          setTitle(
            result.analysis.title,
          );
          setStatement(
            result.analysis
              .problem_statement,
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar o MASP.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        maspId,
      ],
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () =>
            void load(),
          0,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    },
    [
      load,
    ],
  );

  useEffect(
    () => {
      if (
        activeTab !==
          1 ||
        suggestions.length >
          0
      ) {
        return;
      }

      fetch(
        `/api/masp/${maspId}/suggestions`,
        {
          cache:
            "no-store",
        },
      )
        .then(
          (
            response,
          ) =>
            readApiResponse<{
              items: Suggestion[];
            }>(
              response,
            ),
        )
        .then(
          (
            result,
          ) =>
            setSuggestions(
              result.items,
            ),
        )
        .catch(
          (
            suggestionError,
          ) =>
            setError(
              suggestionError instanceof
                Error
                ? suggestionError.message
                : "Não foi possível gerar sugestões.",
            ),
        );
    },
    [
      activeTab,
      maspId,
      suggestions.length,
    ],
  );

  const terminal =
    data?.analysis.status ===
      "CLOSED" ||
    data?.analysis.status ===
      "CANCELLED";

  async function mutate<
    T = {
      success: boolean;
    },
  >(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: Record<
      string,
      unknown
    >,
    successMessage =
      "Alteração salva.",
  ): Promise<T> {
    setBusy(
      true,
    );
    setError(
      "",
    );
    setNotice(
      "",
    );

    try {
      const response =
        await fetch(
          path,
          {
            method,
            headers:
              body
                ? {
                    "Content-Type":
                      "application/json",
                  }
                : undefined,
            body:
              body
                ? JSON.stringify(
                    body,
                  )
                : undefined,
          },
        );

      const result =
        await readApiResponse<T>(
          response,
        );

      setNotice(
        successMessage,
      );
      await load();
      return result;
    } catch (
      mutationError
    ) {
      setError(
        mutationError instanceof
          Error
          ? mutationError.message
          : "Não foi possível salvar.",
      );
      throw mutationError;
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function saveProblem(
    event: FormEvent,
  ) {
    event.preventDefault();
    await mutate(
      `/api/masp/${maspId}`,
      "PATCH",
      {
        title,
        problemStatement:
          statement,
      },
      "Problema atualizado.",
    ).catch(
      () =>
        undefined,
    );
  }

  async function advanceStatus() {
    if (
      !data
    ) {
      return;
    }

    const next =
      NEXT_STATUS[
        data.analysis.status
      ];

    if (
      !next
    ) {
      return;
    }

    await mutate(
      `/api/masp/${maspId}`,
      "PATCH",
      {
        status:
          next,
      },
      next ===
        "CLOSED"
        ? "MASP encerrado com sucesso."
        : `MASP avançou para ${STATUS_LABELS[next]}.`,
    ).catch(
      () =>
        undefined,
    );
  }

  async function addHypothesis(
    description:
      string,
    category:
      MaspCategory,
    source =
      "ANALYST",
    supportCount =
      0,
  ) {
    await mutate(
      `/api/masp/${maspId}/hypotheses`,
      "POST",
      {
        description,
        category,
        source,
        supportCount,
      },
      "Hipótese adicionada ao Ishikawa.",
    );
  }

  const activeRootCauses =
    useMemo(
      () =>
        data
          ?.rootCauses
          .filter(
            (
              cause,
            ) =>
              cause.status !==
              "REJECTED",
          ) ??
        [],
      [
        data,
      ],
    );

  if (
    loading &&
    !data
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F7F6]">
        <div className="flex items-center gap-3 text-[13px] text-[#777C82]">
          <LoaderCircle
            size={18}
            className="animate-spin text-[#E41E2B]"
          />
          Carregando MASP...
        </div>
      </main>
    );
  }

  if (
    !data
  ) {
    return (
      <MaspShell
        userName={
          userName
        }
        title={`MASP #${maspId}`}
        description="A análise não pôde ser carregada."
        backHref="/dashboard/masp"
      >
        <div className="rounded-[16px] border border-[#F0D2D5] bg-[#FFF8F8] p-5 text-[12px] text-[#B52D36]">
          {error}
        </div>
      </MaspShell>
    );
  }

  const nextStatus =
    NEXT_STATUS[
      data.analysis.status
    ];

  return (
    <MaspShell
      userName={
        userName
      }
      title={
        data.analysis.title
      }
      description={`MASP #${data.analysis.id} · ${data.analysis.unit_name} · ${data.analysis.equipment_name ?? "equipamento não definido"}`}
      backHref="/dashboard/masp"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center rounded-full bg-[#FFF0F1] px-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#B82C36]">
            {STATUS_LABELS[
              data.analysis.status
            ] ??
              data.analysis.status}
          </span>
          {nextStatus && (
            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void advanceStatus()
              }
              className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[#E41E2B] px-4 text-[11px] font-semibold text-white hover:bg-[#CB1924] disabled:opacity-50"
            >
              {nextStatus ===
                "CLOSED"
                ? "Encerrar MASP"
                : `Avançar para ${STATUS_LABELS[nextStatus]}`}
              <ArrowRight
                size={14}
              />
            </button>
          )}
        </div>
      }
    >
      <div className="overflow-x-auto rounded-[18px] border border-[#E4E6E8] bg-white p-2">
        <div className="flex min-w-[800px] gap-1">
          {TABS.map(
            (
              tab,
              index,
            ) => (
              <button
                key={
                  tab
                }
                type="button"
                onClick={() =>
                  setActiveTab(
                    index,
                  )
                }
                className={`flex flex-1 items-center gap-2 rounded-[12px] px-3 py-3 text-left text-[10px] font-semibold transition-colors ${activeTab === index ? "bg-[#E41E2B] text-white" : "text-[#71767C] hover:bg-[#F5F5F4]"}`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${activeTab === index ? "bg-white/20" : "bg-[#ECEDEB]"}`}>
                  {index +
                    1}
                </span>
                {tab}
              </button>
            ),
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[11px] leading-5 text-[#B52D36]">
          <AlertTriangle
            size={15}
            className="mt-0.5 shrink-0"
          />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-[#D7E7DA] bg-[#F7FBF7] px-4 py-3 text-[11px] leading-5 text-[#52795A]">
          <CheckCircle2
            size={15}
            className="mt-0.5 shrink-0"
          />
          {notice}
        </div>
      )}

      <div className="mt-5">
        {activeTab ===
          0 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Ocorrências",
                  metric(
                    data.summary
                      .eventCount,
                  ),
                ],
                [
                  "Downtime total",
                  metric(
                    data.summary
                      .downtimeTotalMinutes,
                    " min",
                  ),
                ],
                [
                  "Downtime médio",
                  metric(
                    data.summary
                      .downtimeAverageMinutes,
                    " min",
                  ),
                ],
                [
                  "Período",
                  `${data.summary.firstOccurrence ?? "—"} → ${data.summary.lastOccurrence ?? "—"}`,
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={
                      label
                    }
                    className="rounded-[18px] border border-[#E4E6E8] bg-white p-5"
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#969BA1]">
                      {label}
                    </p>
                    <p className="mt-3 text-[19px] font-semibold tracking-[-0.03em] text-[#34383C]">
                      {value}
                    </p>
                  </div>
                ),
              )}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <MethodCard
                title="Declaração do problema"
                description="Texto determinístico baseado nos eventos; pode ser refinado pelo analista."
              >
                <form
                  onSubmit={
                    saveProblem
                  }
                  className="space-y-4"
                >
                  <input
                    value={
                      title
                    }
                    onChange={(
                      event,
                    ) =>
                      setTitle(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    className={
                      inputClass
                    }
                  />
                  <textarea
                    value={
                      statement
                    }
                    onChange={(
                      event,
                    ) =>
                      setStatement(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    rows={6}
                    className={
                      textareaClass
                    }
                  />
                  {!terminal && (
                    <button
                      type="submit"
                      disabled={
                        busy
                      }
                      className="h-10 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      Salvar problema
                    </button>
                  )}
                </form>
              </MethodCard>

              <MethodCard
                title="Assinatura técnica"
                description="Base local para busca histórica e reincidência."
              >
                <dl className="space-y-3 text-[11px]">
                  {[
                    [
                      "Equipamento",
                      data.summary
                        .equipment,
                    ],
                    [
                      "Linha",
                      data.summary.line,
                    ],
                    [
                      "Componente",
                      data.summary
                        .component,
                    ],
                    [
                      "Modo de falha",
                      data.summary
                        .failureMode,
                    ],
                    [
                      "Origem",
                      data.summary
                        .failureOrigin,
                    ],
                    [
                      "Turnos",
                      data.summary
                        .frequentShifts
                        .join(
                          ", ",
                        ),
                    ],
                  ].map(
                    ([
                      label,
                      value,
                    ]) => (
                      <div
                        key={
                          label
                        }
                        className="flex justify-between gap-4 border-b border-[#EEEFEF] pb-3 last:border-0"
                      >
                        <dt className="text-[#8B9096]">
                          {label}
                        </dt>
                        <dd className="text-right font-medium text-[#44494F]">
                          {value ||
                            "Não identificado"}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </MethodCard>
            </div>

            <MethodCard
              title="Eventos relacionados"
              description="Somente eventos da mesma unidade podem fazer parte da análise."
            >
              {!terminal && (
                <form
                  onSubmit={(
                    event,
                  ) => {
                    event.preventDefault();
                    void mutate(
                      `/api/masp/${maspId}/events`,
                      "POST",
                      {
                        eventId,
                      },
                      "Evento associado.",
                    )
                      .then(
                        () =>
                          setEventId(
                            "",
                          ),
                      )
                      .catch(
                        () =>
                          undefined,
                      );
                  }}
                  className="mb-4 flex gap-2"
                >
                  <input
                    type="number"
                    min={1}
                    value={
                      eventId
                    }
                    onChange={(
                      event,
                    ) =>
                      setEventId(
                        event.target.value,
                      )
                    }
                    placeholder="ID do evento"
                    className={
                      inputClass
                    }
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                  >
                    Associar
                  </button>
                </form>
              )}

              <div className="space-y-2">
                {data.events.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.id
                      }
                      className="flex items-start justify-between gap-4 rounded-[13px] border border-[#E8E9EB] p-4"
                    >
                      <div>
                        <p className="text-[10px] font-semibold text-[#40454A]">
                          #{item.id} · {String(
                            item.event_date,
                          ).slice(
                            0,
                            10,
                          )} · {item.equipment_name ??
                            "Sem equipamento"}
                        </p>
                        <p className="mt-2 text-[10px] leading-5 text-[#858A90]">
                          {item.observation ??
                            "Sem observação"}
                        </p>
                      </div>
                      {!terminal && (
                        <button
                          type="button"
                          onClick={() =>
                            void mutate(
                              `/api/masp/${maspId}/events/${item.id}`,
                              "DELETE",
                              undefined,
                              "Evento removido.",
                            ).catch(
                              () =>
                                undefined,
                            )
                          }
                          className="text-[#9A9FA5] hover:text-[#C92834]"
                          aria-label={`Remover evento ${item.id}`}
                        >
                          <Trash2
                            size={15}
                          />
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>
            </MethodCard>
          </div>
        )}

        {activeTab ===
          1 && (
          <div className="space-y-5">
            <IshikawaBoard
              maspId={
                maspId
              }
              problem={
                data.analysis
                  .problem_statement
              }
              hypotheses={
                data.hypotheses
              }
              onSelect={(
                hypothesis,
              ) => {
                setSelectedHypothesisId(
                  hypothesis.id,
                );

                window.requestAnimationFrame(
                  () => {
                    document
                      .getElementById(
                        `hypothesis-${hypothesis.id}`,
                      )
                      ?.scrollIntoView({
                        behavior:
                          "smooth",
                        block:
                          "center",
                      });
                  },
                );
              }}
            />

            <div className="grid gap-5 xl:grid-cols-2">
              <MethodCard
                title="Brainstorming do analista"
                description="Registre possibilidades sem declará-las automaticamente como causa raiz."
              >
                <form
                  onSubmit={(
                    event,
                  ) => {
                    event.preventDefault();
                    void addHypothesis(
                      hypothesisDescription,
                      hypothesisCategory,
                    )
                      .then(
                        () =>
                          setHypothesisDescription(
                            "",
                          ),
                      )
                      .catch(
                        () =>
                          undefined,
                      );
                  }}
                  className="space-y-3"
                >
                  <select
                    value={
                      hypothesisCategory
                    }
                    onChange={(
                      event,
                    ) =>
                      setHypothesisCategory(
                        event.target.value as
                          MaspCategory,
                      )
                    }
                    disabled={
                      terminal
                    }
                    className={
                      inputClass
                    }
                  >
                    {MASP_CATEGORIES.map(
                      (
                        category,
                      ) => (
                        <option
                          key={
                            category
                          }
                          value={
                            category
                          }
                        >
                          {CATEGORY_LABELS[category]}
                        </option>
                      ),
                    )}
                  </select>
                  <textarea
                    required
                    value={
                      hypothesisDescription
                    }
                    onChange={(
                      event,
                    ) =>
                      setHypothesisDescription(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    rows={3}
                    placeholder="Descreva uma hipótese verificável"
                    className={
                      textareaClass
                    }
                  />
                  {!terminal && (
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                    >
                      <CirclePlus
                        size={14}
                      />
                      Adicionar hipótese
                    </button>
                  )}
                </form>

                <div className="mt-5 space-y-2 border-t border-[#ECEDEF] pt-5">
                  {data.hypotheses.map(
                    (
                      item,
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        id={`hypothesis-${item.id}`}
                        className={`rounded-[13px] border p-4 transition-colors ${selectedHypothesisId === item.id ? "border-[#E41E2B] bg-[#FFF7F7]" : "border-[#E7E8EA]"}`}
                      >
                        <p className="text-[11px] font-medium leading-5 text-[#41464B]">
                          {item.description}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#F2F2F0] px-2 py-1 text-[8px] font-semibold text-[#777C82]">
                            {CATEGORY_LABELS[item.category]}
                          </span>
                          <span className="text-[8px] uppercase tracking-[0.06em] text-[#999DA2]">
                            {item.source} · {item.support_count} apoio(s)
                          </span>
                          {!terminal && (
                            <>
                              <select
                                value={
                                  item.status
                                }
                                onChange={(
                                  event,
                                ) =>
                                  void mutate(
                                    `/api/masp/${maspId}/hypotheses/${item.id}`,
                                    "PATCH",
                                    {
                                      status:
                                        event.target.value,
                                    },
                                    "Status da hipótese atualizado.",
                                  ).catch(
                                    () =>
                                      undefined,
                                  )
                                }
                                className="ml-auto h-8 rounded-[8px] border border-[#E1E3E5] px-2 text-[9px]"
                              >
                                <option value="OPEN">
                                  Aberta
                                </option>
                                <option value="PROBABLE">
                                  Provável
                                </option>
                                <option value="CONFIRMED">
                                  Confirmada
                                </option>
                                <option value="DISCARDED">
                                  Descartada
                                </option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  void mutate(
                                    `/api/masp/${maspId}/hypotheses/${item.id}`,
                                    "DELETE",
                                    undefined,
                                    "Hipótese excluída.",
                                  ).catch(
                                    () =>
                                      undefined,
                                  )
                                }
                                className="text-[#9A9FA5] hover:text-[#C92834]"
                              >
                                <Trash2
                                  size={14}
                                />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </MethodCard>

              <MethodCard
                title="Sugestões baseadas no histórico"
                description="Padrões locais e explicáveis. Uma sugestão só vira hipótese após sua aceitação."
              >
                <div className="space-y-2">
                  {suggestions.map(
                    (
                      suggestion,
                    ) => (
                      <div
                        key={`${suggestion.category}:${suggestion.description}`}
                        className="rounded-[13px] border border-[#E7E8EA] bg-[#FCFCFB] p-4"
                      >
                        <p className="text-[11px] font-medium leading-5 text-[#41464B]">
                          {suggestion.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[8px] uppercase tracking-[0.06em] text-[#999DA2]">
                            {CATEGORY_LABELS[suggestion.category]} · {suggestion.supportCount} ocorrência(s)
                          </span>
                          {!terminal && (
                            <button
                              type="button"
                              onClick={() =>
                                void addHypothesis(
                                  suggestion.description,
                                  suggestion.category,
                                  suggestion.source,
                                  suggestion.supportCount,
                                ).catch(
                                  () =>
                                    undefined,
                                )
                              }
                              className="text-[9px] font-semibold text-[#C92834]"
                            >
                              Aceitar
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                  {suggestions.length ===
                    0 && (
                    <p className="rounded-[13px] border border-dashed border-[#DADDE0] px-4 py-10 text-center text-[10px] text-[#969BA1]">
                      Nenhum padrão 6M recorrente atingiu suporte mínimo no histórico local.
                    </p>
                  )}
                </div>
              </MethodCard>
            </div>
          </div>
        )}

        {activeTab ===
          2 && (
          <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <MethodCard
              title="Novo porquê"
              description="A resposta explica a causa do item anterior. O coach gera avisos, nunca respostas automáticas."
            >
              <form
                onSubmit={(
                  event,
                ) => {
                  event.preventDefault();
                  void mutate<{
                    warnings: string[];
                  }>(
                    `/api/masp/${maspId}/five-whys`,
                    "POST",
                    {
                      parentId:
                        whyParentId ||
                        null,
                      answer:
                        whyAnswer,
                    },
                    "Porquê adicionado.",
                  )
                    .then(
                      (
                        result,
                      ) => {
                        setWhyWarnings(
                          result.warnings,
                        );
                        setWhyAnswer(
                          "",
                        );
                      },
                    )
                    .catch(
                      () =>
                        undefined,
                    );
                }}
                className="space-y-3"
              >
                <select
                  value={
                    whyParentId
                  }
                  onChange={(
                    event,
                  ) =>
                    setWhyParentId(
                      event.target.value,
                    )
                  }
                  disabled={
                    terminal
                  }
                  className={
                    inputClass
                  }
                >
                  <option value="">
                    Partir do problema
                  </option>
                  {data.fiveWhys
                    .filter(
                      (
                        node,
                      ) =>
                        node.status ===
                        "ACTIVE",
                    )
                    .map(
                      (
                        node,
                      ) => (
                        <option
                          key={
                            node.id
                          }
                          value={
                            node.id
                          }
                        >
                          Nível {node.depth}: {node.answer.slice(0, 55)}
                        </option>
                      ),
                    )}
                </select>
                <textarea
                  required
                  value={
                    whyAnswer
                  }
                  onChange={(
                    event,
                  ) =>
                    setWhyAnswer(
                      event.target.value,
                    )
                  }
                  disabled={
                    terminal
                  }
                  rows={5}
                  placeholder="Porque..."
                  className={
                    textareaClass
                  }
                />
                {!terminal && (
                  <button
                    type="submit"
                    className="h-10 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                  >
                    Adicionar à árvore
                  </button>
                )}
              </form>

              {whyWarnings.length >
                0 && (
                <div className="mt-4 space-y-2">
                  {whyWarnings.map(
                    (
                      warning,
                    ) => (
                      <p
                        key={
                          warning
                        }
                        className="rounded-[10px] bg-[#FFF7E8] px-3 py-2 text-[10px] leading-5 text-[#8E671E]"
                      >
                        {warning}
                      </p>
                    ),
                  )}
                </div>
              )}
            </MethodCard>

            <MethodCard
              title="Árvore causal"
              description="A estrutura aceita ramificações e não limita rigidamente a análise a cinco níveis."
            >
              <FiveWhysTree
                nodes={
                  data.fiveWhys
                }
                onAddChild={(
                  id,
                ) =>
                  setWhyParentId(
                    String(
                      id,
                    ),
                  )
                }
                onDiscard={(
                  id,
                ) =>
                  void mutate(
                    `/api/masp/${maspId}/five-whys/${id}`,
                    "PATCH",
                    {
                      status:
                        "DISCARDED",
                    },
                    "Ramo descartado.",
                  ).catch(
                    () =>
                      undefined,
                  )
                }
                onRootCause={(
                  node,
                ) => {
                  setCauseFiveWhyId(
                    String(
                      node.id,
                    ),
                  );
                  setCauseDescription(
                    node.answer,
                  );
                  setActiveTab(
                    3,
                  );
                }}
              />
            </MethodCard>
          </div>
        )}

        {activeTab ===
          3 && (
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              <MethodCard
                title="Propor causa raiz"
                description="Uma causa proposta só pode ser confirmada após existir evidência ou resumo de evidência."
              >
                <form
                  onSubmit={(
                    event,
                  ) => {
                    event.preventDefault();
                    void mutate(
                      `/api/masp/${maspId}/root-causes`,
                      "POST",
                      {
                        fiveWhyId:
                          causeFiveWhyId ||
                          null,
                        description:
                          causeDescription,
                        evidenceSummary:
                          causeEvidenceSummary,
                      },
                      "Causa raiz proposta.",
                    )
                      .then(
                        () => {
                          setCauseDescription(
                            "",
                          );
                          setCauseEvidenceSummary(
                            "",
                          );
                          setCauseFiveWhyId(
                            "",
                          );
                        },
                      )
                      .catch(
                        () =>
                          undefined,
                      );
                  }}
                  className="space-y-3"
                >
                  <select
                    value={
                      causeFiveWhyId
                    }
                    onChange={(
                      event,
                    ) =>
                      setCauseFiveWhyId(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    className={
                      inputClass
                    }
                  >
                    <option value="">
                      Inserção manual
                    </option>
                    {data.fiveWhys.map(
                      (
                        node,
                      ) => (
                        <option
                          key={
                            node.id
                          }
                          value={
                            node.id
                          }
                        >
                          Por quê {node.depth}: {node.answer.slice(0, 55)}
                        </option>
                      ),
                    )}
                  </select>
                  <textarea
                    required
                    value={
                      causeDescription
                    }
                    onChange={(
                      event,
                    ) =>
                      setCauseDescription(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    rows={4}
                    placeholder="Descrição da causa proposta"
                    className={
                      textareaClass
                    }
                  />
                  <textarea
                    value={
                      causeEvidenceSummary
                    }
                    onChange={(
                      event,
                    ) =>
                      setCauseEvidenceSummary(
                        event.target.value,
                      )
                    }
                    disabled={
                      terminal
                    }
                    rows={3}
                    placeholder="Resumo da evidência (opcional na proposta)"
                    className={
                      textareaClass
                    }
                  />
                  {!terminal && (
                    <button
                      type="submit"
                      className="h-10 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                    >
                      Registrar proposta
                    </button>
                  )}
                </form>
              </MethodCard>

              <MethodCard
                title="Causas registradas"
              >
                <div className="space-y-3">
                  {data.rootCauses.map(
                    (
                      cause,
                    ) => (
                      <div
                        key={
                          cause.id
                        }
                        className={`rounded-[14px] border p-4 ${cause.status === "CONFIRMED" ? "border-[#BCD9C2] bg-[#F7FBF7]" : "border-[#E5E7E9]"}`}
                      >
                        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#7E8389]">
                          {cause.status ===
                            "CONFIRMED"
                            ? "Causa raiz confirmada"
                            : cause.status ===
                                "REJECTED"
                              ? "Causa rejeitada"
                              : "Causa raiz proposta"}
                        </p>
                        <p className="mt-2 text-[12px] font-medium leading-5 text-[#3E4348]">
                          {cause.description}
                        </p>
                        {cause.evidence_summary && (
                          <p className="mt-2 text-[10px] leading-5 text-[#777C82]">
                            Evidência: {cause.evidence_summary}
                          </p>
                        )}
                        {!terminal &&
                          cause.status ===
                            "PROPOSED" && (
                          <div className="mt-3 flex gap-3 border-t border-[#E5E7E9] pt-3">
                            <button
                              type="button"
                              onClick={() =>
                                void mutate(
                                  `/api/masp/${maspId}/root-causes/${cause.id}`,
                                  "PATCH",
                                  {
                                    status:
                                      "CONFIRMED",
                                  },
                                  "Causa raiz confirmada pelo analista.",
                                ).catch(
                                  () =>
                                    undefined,
                                )
                              }
                              className="text-[9px] font-semibold text-[#39734A]"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void mutate(
                                  `/api/masp/${maspId}/root-causes/${cause.id}`,
                                  "PATCH",
                                  {
                                    status:
                                      "REJECTED",
                                  },
                                  "Causa rejeitada.",
                                ).catch(
                                  () =>
                                    undefined,
                                )
                              }
                              className="text-[9px] font-semibold text-[#9A4A50]"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </MethodCard>
            </div>

            <MethodCard
              title="Evidências"
              description="EVENT associa uma ocorrência existente; DOCUMENT registra apenas metadados nesta versão."
            >
              <form
                onSubmit={(
                  event,
                ) => {
                  event.preventDefault();
                  void mutate(
                    `/api/masp/${maspId}/evidence`,
                    "POST",
                    {
                      type:
                        evidenceType,
                      description:
                        evidenceDescription,
                      eventId:
                        evidenceType ===
                          "EVENT"
                          ? evidenceEventId
                          : null,
                    },
                    "Evidência adicionada.",
                  )
                    .then(
                      () => {
                        setEvidenceDescription(
                          "",
                        );
                        setEvidenceEventId(
                          "",
                        );
                      },
                    )
                    .catch(
                      () =>
                        undefined,
                    );
                }}
                className="space-y-3"
              >
                <select
                  value={
                    evidenceType
                  }
                  onChange={(
                    event,
                  ) =>
                    setEvidenceType(
                      event.target.value,
                    )
                  }
                  disabled={
                    terminal
                  }
                  className={
                    inputClass
                  }
                >
                  <option value="TEXT">
                    Texto
                  </option>
                  <option value="EVENT">
                    Evento
                  </option>
                  <option value="MEASUREMENT">
                    Medição
                  </option>
                  <option value="DOCUMENT">
                    Documento (metadados)
                  </option>
                </select>
                {evidenceType ===
                  "EVENT" && (
                  <input
                    type="number"
                    min={1}
                    required
                    value={
                      evidenceEventId
                    }
                    onChange={(
                      event,
                    ) =>
                      setEvidenceEventId(
                        event.target.value,
                      )
                    }
                    placeholder="ID do evento"
                    className={
                      inputClass
                    }
                  />
                )}
                <textarea
                  required
                  value={
                    evidenceDescription
                  }
                  onChange={(
                    event,
                  ) =>
                    setEvidenceDescription(
                      event.target.value,
                    )
                  }
                  disabled={
                    terminal
                  }
                  rows={4}
                  placeholder="Descreva o que esta evidência demonstra"
                  className={
                    textareaClass
                  }
                />
                {!terminal && (
                  <button
                    type="submit"
                    className="h-10 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                  >
                    Adicionar evidência
                  </button>
                )}
              </form>

              <div className="mt-5 space-y-2 border-t border-[#ECEDEF] pt-5">
                {data.evidence.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.id
                      }
                      className="rounded-[13px] border border-[#E7E8EA] p-4"
                    >
                      <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#E41E2B]">
                        {item.type}
                      </span>
                      <p className="mt-2 text-[11px] leading-5 text-[#4B5056]">
                        {item.description}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </MethodCard>
          </div>
        )}

        {activeTab ===
          4 && (
          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <MethodCard
              title="Nova ação 5W2H"
              description="HOW MUCH é opcional e textual. Nenhum cálculo financeiro é realizado."
            >
              <form
                onSubmit={(
                  event,
                ) => {
                  event.preventDefault();
                  void mutate(
                    `/api/masp/${maspId}/actions`,
                    "POST",
                    actionForm,
                    "Ação criada.",
                  )
                    .then(
                      () =>
                        setActionForm({
                          rootCauseId:
                            "",
                          what:
                            "",
                          why:
                            "",
                          whereText:
                            "",
                          whenDate:
                            "",
                          whoText:
                            "",
                          howText:
                            "",
                          howMuchText:
                            "",
                        }),
                    )
                    .catch(
                      () =>
                        undefined,
                    );
                }}
                className="space-y-3"
              >
                <select
                  value={
                    actionForm
                      .rootCauseId
                  }
                  onChange={(
                    event,
                  ) =>
                    setActionForm({
                      ...actionForm,
                      rootCauseId:
                        event.target.value,
                    })
                  }
                  disabled={
                    terminal
                  }
                  className={
                    inputClass
                  }
                >
                  <option value="">
                    Sem causa vinculada
                  </option>
                  {activeRootCauses.map(
                    (
                      cause,
                    ) => (
                      <option
                        key={
                          cause.id
                        }
                        value={
                          cause.id
                        }
                      >
                        {cause.description.slice(0, 70)}
                      </option>
                    ),
                  )}
                </select>
                {[
                  [
                    "what",
                    "WHAT — O que será feito?",
                    true,
                  ],
                  [
                    "why",
                    "WHY — Por que será feito?",
                    false,
                  ],
                  [
                    "whereText",
                    "WHERE — Onde?",
                    false,
                  ],
                  [
                    "whoText",
                    "WHO — Quem?",
                    false,
                  ],
                  [
                    "howText",
                    "HOW — Como?",
                    false,
                  ],
                  [
                    "howMuchText",
                    "HOW MUCH — Informação textual opcional",
                    false,
                  ],
                ].map(
                  ([
                    field,
                    placeholder,
                    required,
                  ]) => (
                    <input
                      key={
                        field as string
                      }
                      required={
                        required as boolean
                      }
                      value={
                        actionForm[
                          field as keyof typeof actionForm
                        ]
                      }
                      onChange={(
                        event,
                      ) =>
                        setActionForm({
                          ...actionForm,
                          [field as string]:
                            event.target.value,
                        })
                      }
                      disabled={
                        terminal
                      }
                      placeholder={
                        placeholder as string
                      }
                      className={
                        inputClass
                      }
                    />
                  ),
                )}
                <input
                  type="date"
                  value={
                    actionForm.whenDate
                  }
                  onChange={(
                    event,
                  ) =>
                    setActionForm({
                      ...actionForm,
                      whenDate:
                        event.target.value,
                    })
                  }
                  disabled={
                    terminal
                  }
                  className={
                    inputClass
                  }
                />
                {!terminal && (
                  <button
                    type="submit"
                    className="h-10 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                  >
                    Adicionar ao plano
                  </button>
                )}
              </form>
            </MethodCard>

            <MethodCard
              title="Plano e execução"
            >
              <div className="space-y-3">
                {data.actions.map(
                  (
                    action,
                  ) => (
                    <div
                      key={
                        action.id
                      }
                      className="rounded-[15px] border border-[#E5E7E9] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#E41E2B]">
                            What
                          </p>
                          <p className="mt-2 text-[12px] font-semibold leading-5 text-[#3E4348]">
                            {action.what}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#F2F2F0] px-2.5 py-1 text-[8px] font-semibold text-[#73787E]">
                          {action.status}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 border-t border-[#ECEDEF] pt-4 text-[10px] text-[#71767C] sm:grid-cols-2">
                        <p>
                          <strong className="text-[#4B5056]">Why:</strong> {action.why ?? "—"}
                        </p>
                        <p>
                          <strong className="text-[#4B5056]">Where:</strong> {action.where_text ?? "—"}
                        </p>
                        <p>
                          <strong className="text-[#4B5056]">When:</strong> {action.when_date ? String(action.when_date).slice(0, 10) : "—"}
                        </p>
                        <p>
                          <strong className="text-[#4B5056]">Who:</strong> {action.who_user_name ?? action.who_text ?? "—"}
                        </p>
                        <p>
                          <strong className="text-[#4B5056]">How:</strong> {action.how_text ?? "—"}
                        </p>
                        <p>
                          <strong className="text-[#4B5056]">How much:</strong> {action.how_much_text ?? "Opcional"}
                        </p>
                      </div>
                      {!terminal && (
                        <div className="mt-4 flex items-center gap-2">
                          <select
                            value={
                              action.status
                            }
                            onChange={(
                              event,
                            ) =>
                              void mutate(
                                `/api/masp/${maspId}/actions/${action.id}`,
                                "PATCH",
                                {
                                  status:
                                    event.target.value,
                                },
                                "Status da ação atualizado.",
                              ).catch(
                                () =>
                                  undefined,
                              )
                            }
                            className="h-8 rounded-[8px] border border-[#E1E3E5] px-2 text-[9px]"
                          >
                            <option value="PLANNED">
                              Planejada
                            </option>
                            <option value="IN_PROGRESS">
                              Em andamento
                            </option>
                            <option value="DONE">
                              Concluída
                            </option>
                            <option value="CANCELLED">
                              Cancelada
                            </option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void mutate(
                                `/api/masp/${maspId}/actions/${action.id}`,
                                "DELETE",
                                undefined,
                                "Ação excluída.",
                              ).catch(
                                () =>
                                  undefined,
                              )
                            }
                            className="text-[#9A9FA5] hover:text-[#C92834]"
                          >
                            <Trash2
                              size={14}
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </MethodCard>
          </div>
        )}

        {activeTab ===
          5 && (
          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <MethodCard
              title="Registrar verificação"
              description="As métricas são calculadas localmente pela assinatura técnica do MASP."
            >
              <form
                onSubmit={(
                  event,
                ) => {
                  event.preventDefault();
                  void mutate(
                    `/api/masp/${maspId}/verification`,
                    "POST",
                    verificationForm,
                    "Verificação registrada.",
                  ).catch(
                    () =>
                      undefined,
                  );
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#858A90]">
                    Início antes
                    <input
                      type="date"
                      value={
                        verificationForm
                          .baselineStart
                      }
                      onChange={(
                        event,
                      ) =>
                        setVerificationForm({
                          ...verificationForm,
                          baselineStart:
                            event.target.value,
                        })
                      }
                      disabled={
                        terminal
                      }
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#858A90]">
                    Fim antes
                    <input
                      type="date"
                      value={
                        verificationForm
                          .baselineEnd
                      }
                      onChange={(
                        event,
                      ) =>
                        setVerificationForm({
                          ...verificationForm,
                          baselineEnd:
                            event.target.value,
                        })
                      }
                      disabled={
                        terminal
                      }
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#858A90]">
                    Início após
                    <input
                      required
                      type="date"
                      value={
                        verificationForm
                          .verificationStart
                      }
                      onChange={(
                        event,
                      ) =>
                        setVerificationForm({
                          ...verificationForm,
                          verificationStart:
                            event.target.value,
                        })
                      }
                      disabled={
                        terminal
                      }
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#858A90]">
                    Fim após
                    <input
                      type="date"
                      value={
                        verificationForm
                          .verificationEnd
                      }
                      onChange={(
                        event,
                      ) =>
                        setVerificationForm({
                          ...verificationForm,
                          verificationEnd:
                            event.target.value,
                        })
                      }
                      disabled={
                        terminal
                      }
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>
                </div>
                <textarea
                  value={
                    verificationForm.notes
                  }
                  onChange={(
                    event,
                  ) =>
                    setVerificationForm({
                      ...verificationForm,
                      notes:
                        event.target.value,
                    })
                  }
                  disabled={
                    terminal
                  }
                  rows={4}
                  placeholder="Observações técnicas"
                  className={
                    textareaClass
                  }
                />
                {!terminal && (
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2F3337] px-4 text-[10px] font-semibold text-white"
                  >
                    <RefreshCw
                      size={13}
                    />
                    Calcular e registrar
                  </button>
                )}
              </form>
            </MethodCard>

            <MethodCard
              title="Antes × após"
              description="Comparação técnica de ocorrências, downtime médio e reincidência."
            >
              <div className="space-y-4">
                {data.verifications.map(
                  (
                    verification,
                  ) => {
                    const beforeCount =
                      Number(
                        verification
                          .event_count_before ?? 0,
                      );
                    const afterCount =
                      Number(
                        verification
                          .event_count_after ?? 0,
                      );
                    const beforeDowntime =
                      Number(
                        verification
                          .downtime_before_minutes ?? 0,
                      );
                    const afterDowntime =
                      Number(
                        verification
                          .downtime_after_minutes ?? 0,
                      );

                    return (
                      <div
                        key={
                          verification.id
                        }
                        className="rounded-[16px] border border-[#E5E7E9] p-5"
                      >
                        {Boolean(
                          verification
                            .recurrence_detected,
                        ) && (
                          <p className="mb-4 rounded-[10px] bg-[#FFF1E8] px-3 py-2 text-[10px] font-medium text-[#9A5529]">
                            Reincidência detectada durante o período de verificação.
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-[13px] bg-[#F6F6F5] p-4">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#858A90]">
                              Antes
                            </p>
                            <p className="mt-3 text-[20px] font-semibold text-[#3A3E43]">
                              {metric(
                                beforeCount,
                              )} ocorrências
                            </p>
                            <p className="mt-2 text-[10px] text-[#777C82]">
                              {metric(
                                beforeDowntime,
                                " min downtime",
                              )}
                            </p>
                            <p className="mt-1 text-[10px] text-[#777C82]">
                              {metric(
                                beforeCount > 0
                                  ? beforeDowntime /
                                    beforeCount
                                  : 0,
                                " min/ocorrência",
                              )}
                            </p>
                          </div>
                          <div className="rounded-[13px] bg-[#F3F9F4] p-4">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#568060]">
                              Após
                            </p>
                            <p className="mt-3 text-[20px] font-semibold text-[#3A3E43]">
                              {metric(
                                afterCount,
                              )} ocorrências
                            </p>
                            <p className="mt-2 text-[10px] text-[#667B6B]">
                              {metric(
                                afterDowntime,
                                " min downtime",
                              )}
                            </p>
                            <p className="mt-1 text-[10px] text-[#667B6B]">
                              {metric(
                                afterCount > 0
                                  ? afterDowntime /
                                    afterCount
                                  : 0,
                                " min/ocorrência",
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}

                {data.verifications.length ===
                  0 && (
                  <div className="rounded-[15px] border border-dashed border-[#DADDE0] px-5 py-12 text-center text-[11px] text-[#969BA1]">
                    Nenhuma verificação registrada.
                  </div>
                )}
              </div>
            </MethodCard>
          </div>
        )}
      </div>

      {busy && (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-[#25282C] px-4 py-3 text-[10px] font-semibold text-white shadow-lg">
          <LoaderCircle
            size={14}
            className="animate-spin"
          />
          Salvando...
        </div>
      )}
    </MaspShell>
  );
}
