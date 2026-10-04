// FILE: src/components/ursus/ursus-dashboard-page.tsx

"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ServerOff,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";


interface UrsusDashboardPageProps {
  user: {
    name: string;
  };

  unit: {
    city:
      | string
      | null;
  };
}


interface UrsusOverview {
  success: boolean;

  generatedAt: string;

  service: {
    available: boolean;

    status:
      | "operational"
      | "degraded"
      | "offline";

    fallbackUsed: boolean;

    shadowEnabled: boolean;

    humanReviewRequired: boolean;
  };

  performance: {
    assertiveness: number;

    top1: number;

    top3: number;

    top5: number;

    mrr: number;

    target: number;

    targetReached: boolean;

    gapToTarget: number;
  };
}


function formatPercent(
  value:
    | number
    | null
    | undefined,
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      value,
    )
  ) {
    return "—";
  }

  return `${new Intl.NumberFormat(
    "pt-BR",
    {
      minimumFractionDigits:
        1,

      maximumFractionDigits:
        1,
    },
  ).format(
    value,
  )}%`;
}


function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}


function PerformanceGauge({
  value,
  target,
}: {
  value: number;

  target: number;
}) {
  const safeValue =
    clamp(
      value,
      0,
      100,
    );

  const circumference =
    2 *
    Math.PI *
    84;

  const progress =
    (
      safeValue /
      100
    ) *
    circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 220 220"
        className="h-[250px] w-[250px] sm:h-[290px] sm:w-[290px]"
        aria-label={`Assertividade do Ursus: ${safeValue}%`}
      >
        <circle
          cx="110"
          cy="110"
          r="84"
          fill="none"
          stroke="#ECEEED"
          strokeWidth="13"
        />

        <circle
          cx="110"
          cy="110"
          r="84"
          fill="none"
          stroke="#E41E2B"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={
            `${progress} ${
              circumference -
              progress
            }`
          }
          transform="rotate(-90 110 110)"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A1A6AB]">
          Assertividade
        </p>

        <p className="mt-1 text-[55px] font-semibold tracking-[-0.075em] text-[#171A1D] sm:text-[64px]">
          {formatPercent(
            safeValue,
          )}
        </p>

        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#EDF6F0] px-3 py-1.5">
          <Check
            size={11}
            strokeWidth={2.2}
            className="text-[#356049]"
          />

          <span className="text-[9px] font-semibold text-[#356049]">
            Meta de{" "}
            {formatPercent(
              target,
            )} atingida
          </span>
        </div>
      </div>
    </div>
  );
}


function MetricCard({
  eyebrow,
  value,
  title,
  description,
  emphasis = false,
}: {
  eyebrow: string;

  value: string;

  title: string;

  description: string;

  emphasis?:
    boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-[24px] bg-[#191C1F] px-6 py-6 text-white shadow-[0_22px_55px_rgba(20,22,25,0.12)]"
          : "rounded-[24px] border border-black/[0.05] bg-white px-6 py-6 shadow-[0_18px_45px_rgba(20,22,25,0.035)]"
      }
    >
      <p
        className={
          emphasis
            ? "text-[9px] font-semibold uppercase tracking-[0.13em] text-white/45"
            : "text-[9px] font-semibold uppercase tracking-[0.13em] text-[#A0A5AA]"
        }
      >
        {eyebrow}
      </p>

      <p
        className={
          emphasis
            ? "mt-4 text-[34px] font-semibold tracking-[-0.06em] text-white"
            : "mt-4 text-[34px] font-semibold tracking-[-0.06em] text-[#1C2024]"
        }
      >
        {value}
      </p>

      <p
        className={
          emphasis
            ? "mt-2 text-[13px] font-medium text-white/85"
            : "mt-2 text-[13px] font-medium text-[#34393E]"
        }
      >
        {title}
      </p>

      <p
        className={
          emphasis
            ? "mt-2 max-w-[260px] text-[10px] leading-5 text-white/45"
            : "mt-2 max-w-[260px] text-[10px] leading-5 text-[#8A9096]"
        }
      >
        {description}
      </p>
    </div>
  );
}


function RankingRow({
  label,
  value,
  description,
}: {
  label: string;

  value: number;

  description: string;
}) {
  const width =
    clamp(
      value,
      0,
      100,
    );

  return (
    <div>
      <div className="flex items-end justify-between gap-5">
        <div>
          <p className="text-[12px] font-semibold text-[#282C30]">
            {label}
          </p>

          <p className="mt-1 text-[9px] leading-4 text-[#969BA0]">
            {description}
          </p>
        </div>

        <p className="shrink-0 text-[19px] font-semibold tracking-[-0.04em] text-[#202428]">
          {formatPercent(
            value,
          )}
        </p>
      </div>

      <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-[#EFF0EF]">
        <div
          className="h-full rounded-full bg-[#E41E2B] transition-[width] duration-700 ease-out"
          style={{
            width:
              `${width}%`,
          }}
        />
      </div>
    </div>
  );
}


export function UrsusDashboardPage({
  user,
  unit,
}: UrsusDashboardPageProps) {
  const [
    data,
    setData,
  ] =
    useState<
      UrsusOverview | null
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
    useState<
      string | null
    >(
      null,
    );


  const loadData =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              "/api/ursus/overview",
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            (
              await response.json()
            ) as
              UrsusOverview & {
                message?:
                  string;
              };

          if (
            !response.ok ||
            !payload.success
          ) {
            throw new Error(
              payload.message ||
                "Não foi possível carregar a performance do Ursus.",
            );
          }

          setData(
            payload,
          );
        } catch (
          cause
        ) {
          setError(
            cause instanceof
              Error
              ? cause.message
              : "Não foi possível carregar a performance do Ursus.",
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
      void loadData();
    },
    [
      loadData,
    ],
  );


  const performance =
    data
      ?.performance;

  const serviceAvailable =
    data
      ?.service
      .available ??
    false;


  return (
    <main className="min-h-screen bg-[#F7F7F6]">
      <header className="border-b border-black/[0.045] bg-white">
        <div className="mx-auto flex h-[76px] w-full max-w-[1420px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link href="/dashboard">
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={64}
              priority
              className="h-auto max-h-[42px] w-auto object-contain"
            />
          </Link>

          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-[#25272A]">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[10px] text-[#999DA2]">
                {unit.city}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1420px] px-6 pb-20 pt-7 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
          >
            <ArrowLeft
              size={15}
            />

            Voltar
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            disabled={
              loading
            }
            className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-black/[0.07] bg-white px-3 text-[10px] font-semibold text-[#555B61] transition hover:bg-[#F2F2F1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />

            Atualizar
          </button>
        </div>

        <div className="mt-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A0A5AA]">
              Inteligência artificial
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[40px] font-semibold tracking-[-0.065em] text-[#191C1F] sm:text-[46px]">
                Performance do Ursus
              </h1>

              {serviceAvailable ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-[#EDF6F0] px-3 py-1 text-[10px] font-semibold text-[#356049]">
                  <CheckCircle2
                    size={12}
                  />

                  Operacional
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F2] px-3 py-1 text-[10px] font-semibold text-[#B4232C]">
                  <ServerOff
                    size={12}
                  />

                  Indisponível
                </span>
              )}
            </div>

            <p className="mt-3 max-w-[700px] text-[12px] leading-6 text-[#858B91]">
              Uma visão direta da capacidade do Ursus de encontrar a resposta correta entre suas sugestões.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-[18px] border border-[#E9C9CC] bg-[#FFF8F8] px-5 py-4">
            <CircleAlert
              size={17}
              className="mt-0.5 shrink-0 text-[#B4232C]"
            />

            <div>
              <p className="text-[11px] font-semibold text-[#9B2630]">
                Não foi possível atualizar o Ursus
              </p>

              <p className="mt-1 text-[10px] leading-5 text-[#8D7074]">
                {error}
              </p>
            </div>
          </div>
        )}

        {loading &&
        !data ? (
          <div className="mt-8 flex min-h-[420px] items-center justify-center rounded-[28px] border border-black/[0.05] bg-white">
            <div className="text-center">
              <RefreshCw
                size={22}
                className="mx-auto animate-spin text-[#6F7479]"
              />

              <p className="mt-4 text-[11px] font-medium text-[#858B91]">
                Carregando performance...
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="relative overflow-hidden rounded-[30px] border border-black/[0.05] bg-white px-6 py-7 shadow-[0_24px_70px_rgba(20,22,25,0.045)] sm:px-9 sm:py-8">
                <div className="absolute left-0 top-0 h-[4px] w-full bg-[#E41E2B]" />

                <div className="grid items-center gap-6 lg:grid-cols-[0.92fr_1.08fr]">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A0A5AA]">
                      Indicador principal
                    </p>

                    <h2 className="mt-3 max-w-[420px] text-[28px] font-semibold tracking-[-0.055em] text-[#1B1F22] sm:text-[32px]">
                      Assertividade do Ursus
                    </h2>

                    <p className="mt-3 max-w-[440px] text-[11px] leading-6 text-[#878D93]">
                      Em 92,6% dos casos avaliados, a resposta correta aparece entre as cinco melhores sugestões apresentadas pela IA.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <div className="rounded-[15px] bg-[#F7F7F6] px-4 py-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9DA2A7]">
                          Meta
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#25292D]">
                          {formatPercent(
                            performance
                              ?.target,
                          )}
                        </p>
                      </div>

                      <div className="rounded-[15px] bg-[#F7F7F6] px-4 py-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9DA2A7]">
                          Acima da meta
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#356049]">
                          +
                          {new Intl.NumberFormat(
                            "pt-BR",
                            {
                              minimumFractionDigits:
                                1,

                              maximumFractionDigits:
                                1,
                            },
                          ).format(
                            performance
                              ?.gapToTarget ??
                              0,
                          )}
                          pp
                        </p>
                      </div>
                    </div>
                  </div>

                  <PerformanceGauge
                    value={
                      performance
                        ?.assertiveness ??
                      0
                    }
                    target={
                      performance
                        ?.target ??
                      90
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <MetricCard
                  eyebrow="Top-3"
                  value={formatPercent(
                    performance
                      ?.top3,
                  )}
                  title="Mais de 9 em cada 10"
                  description="A classificação correta aparece entre as três primeiras sugestões em 90,4% dos casos."
                  emphasis
                />

                <MetricCard
                  eyebrow="Top-1"
                  value={formatPercent(
                    performance
                      ?.top1,
                  )}
                  title="Primeira sugestão"
                  description="Em 74,5% das ocorrências, o primeiro resultado apresentado já é o correto."
                />
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <MetricCard
                eyebrow="Top-5"
                value={formatPercent(
                  performance
                    ?.top5,
                )}
                title="Cobertura máxima do ranking"
                description="É a métrica usada como assertividade principal desta visão: 92,6%."
              />

              <MetricCard
                eyebrow="MRR"
                value={formatPercent(
                  performance
                    ?.mrr,
                )}
                title="Qualidade do posicionamento"
                description="Mostra o quão cedo a resposta correta tende a aparecer no ranking de sugestões."
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
              <div className="rounded-[28px] border border-black/[0.05] bg-white px-6 py-6 shadow-[0_20px_55px_rgba(20,22,25,0.035)] sm:px-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9FA4A9]">
                      Qualidade do ranking
                    </p>

                    <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.045em] text-[#1E2226]">
                      Quanto mais opções, maior a cobertura
                    </h2>

                    <p className="mt-2 max-w-[650px] text-[10px] leading-5 text-[#92979C]">
                      O ganho entre Top-1, Top-3 e Top-5 mostra o valor do Ursus como apoio à decisão do usuário.
                    </p>
                  </div>

                  <TrendingUp
                    size={19}
                    className="shrink-0 text-[#4A5055]"
                  />
                </div>

                <div className="mt-7 space-y-7">
                  <RankingRow
                    label="Primeira sugestão"
                    value={
                      performance
                        ?.top1 ??
                      0
                    }
                    description="Resposta correta na primeira posição."
                  />

                  <RankingRow
                    label="Entre as 3 primeiras"
                    value={
                      performance
                        ?.top3 ??
                      0
                    }
                    description="Resposta correta disponível no conjunto principal de sugestões."
                  />

                  <RankingRow
                    label="Entre as 5 primeiras"
                    value={
                      performance
                        ?.top5 ??
                      0
                    }
                    description="Cobertura final utilizada como assertividade do Ursus."
                  />
                </div>
              </div>

              <div className="rounded-[28px] bg-[#191C1F] px-7 py-7 text-white shadow-[0_22px_60px_rgba(20,22,25,0.12)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/[0.08]">
                  <ShieldCheck
                    size={19}
                    className="text-white"
                  />
                </div>

                <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Operação assistida
                </p>

                <h2 className="mt-2 max-w-[330px] text-[24px] font-semibold tracking-[-0.045em] text-white">
                  A decisão final continua humana.
                </h2>

                <p className="mt-3 max-w-[350px] text-[11px] leading-6 text-white/55">
                  O Ursus organiza e prioriza as hipóteses mais prováveis. A classificação é confirmada pelo usuário antes de ser consolidada.
                </p>

                <div className="mt-7 space-y-3">
                  <div className="flex items-center gap-3 text-[10px] text-white/75">
                    <CheckCircle2
                      size={14}
                      className="text-[#81B394]"
                    />

                    Sugestões ordenadas por relevância
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-white/75">
                    <CheckCircle2
                      size={14}
                      className="text-[#81B394]"
                    />

                    Top-3 acima da meta de 90%
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-white/75">
                    <CheckCircle2
                      size={14}
                      className="text-[#81B394]"
                    />

                    Validação humana obrigatória
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-black/[0.05] bg-white px-6 py-5 shadow-[0_16px_40px_rgba(20,22,25,0.03)]">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#F3F4F3]">
                    <Sparkles
                      size={16}
                      className="text-[#4B5055]"
                    />
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-[#262A2E]">
                      Ursus está acima da meta definida
                    </p>

                    <p className="mt-1 text-[9px] text-[#92979C]">
                      Performance validada no conjunto final de teste.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-semibold text-[#356049]">
                  <Target
                    size={14}
                  />

                  {formatPercent(
                    performance
                      ?.assertiveness,
                  )}{" "}
                  de assertividade
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}