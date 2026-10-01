"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { AppHeader } from "@/components/layout/app-header";

import {
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  Play,
  Search,
} from "lucide-react";


interface PredictionItem {
  failedComponentCode: string;
  failureMode: string;
  confidence: number;
}


interface Prediction {
  modelVersion: string;
  failedComponentCode: string;
  failureMode: string;
  confidence: number;
  topPredictions: PredictionItem[];
}


interface HealthState {
  loading: boolean;
  available: boolean;
  modelVersion: string | null;
}


interface BatchResult {
  modelVersion: string;

  requestedLimit: number;

  found: number;

  processed: number;

  inserted: number;

  failed: number;
}


function percentage(
  value: number,
): string {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(
    value,
  );
}


export function MlTestPanel() {
  const [
    observation,
    setObservation,
  ] = useState("");

  const [
    equipment,
    setEquipment,
  ] = useState("");

  const [
    prediction,
    setPrediction,
  ] =
    useState<Prediction | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    health,
    setHealth,
  ] =
    useState<HealthState>({
      loading: true,
      available: false,
      modelVersion: null,
    });

  const [
    batchSize,
    setBatchSize,
  ] = useState(20);

  const [
    batchLoading,
    setBatchLoading,
  ] = useState(false);

  const [
    batchResult,
    setBatchResult,
  ] =
    useState<BatchResult | null>(
      null,
    );

  const [
    batchError,
    setBatchError,
  ] =
    useState<string | null>(
      null,
    );


  useEffect(() => {
    async function loadHealth() {
      try {
        const response =
          await fetch(
            "/api/ml/health",
            {
              cache: "no-store",
            },
          );

        const data =
          await response.json();

        setHealth({
          loading: false,

          available:
            Boolean(
              data.available,
            ),

          modelVersion:
            data.modelVersion ??
            null,
        });
      } catch {
        setHealth({
          loading: false,
          available: false,
          modelVersion: null,
        });
      }
    }

    void loadHealth();
  }, []);


  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    const cleanObservation =
      observation.trim();

    if (!cleanObservation) {
      setError(
        "Informe uma ocorrência.",
      );

      return;
    }

    setLoading(
      true,
    );

    setError(
      null,
    );

    setPrediction(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/ml/predict",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                observation:
                  cleanObservation,

                equipment:
                  equipment.trim(),
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Não foi possível consultar o Modelo ML.",
        );
      }

      setPrediction(
        data.prediction,
      );
    } catch (requestError) {
      setError(
        requestError
          instanceof Error
          ? requestError.message
          : "Erro ao consultar o Modelo ML.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  async function handleBatch() {
    setBatchLoading(
      true,
    );

    setBatchError(
      null,
    );

    setBatchResult(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/ml/classify-pending",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                limit:
                  batchSize,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Não foi possível processar as ocorrências.",
        );
      }

      setBatchResult(
        data,
      );
    } catch (requestError) {
      setBatchError(
        requestError
          instanceof Error
          ? requestError.message
          : "Erro ao processar ocorrências.",
      );
    } finally {
      setBatchLoading(
        false,
      );
    }
  }


  return (
    <main className="min-h-screen bg-[#f7f7f7]">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e41e2b] text-white">
              <Cpu
                size={21}
              />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
                Modelo ML
              </h1>

              <p className="mt-1 text-sm text-neutral-500">
                Classificação assistida de falhas
              </p>
            </div>
          </div>

          <p className="max-w-3xl text-sm leading-6 text-neutral-600">
            O modelo identifica qual componente provavelmente
            falhou. Toda sugestão permanece pendente até revisão
            humana.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">

            <section className="rounded-[28px] border border-black/5 bg-background-primary transition-colors p-7 shadow-sm">
              <div className="mb-7 flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800">
                  <Database
                    size={20}
                  />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">
                    Classificar ocorrências reais
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
                    Envie apontamentos ainda não analisados para o
                    Modelo ML. Os resultados serão armazenados como
                    sugestões pendentes de revisão.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div>
                  <label
                    htmlFor="batchSize"
                    className="mb-2 block text-sm font-medium text-neutral-700"
                  >
                    Quantidade
                  </label>

                  <select
                    id="batchSize"
                    value={
                      batchSize
                    }
                    onChange={(
                      event,
                    ) =>
                      setBatchSize(
                        Number(
                          event.target.value,
                        ),
                      )
                    }
                    className="h-12 min-w-40 rounded-2xl border border-neutral-200 bg-background-primary transition-colors px-4 text-sm outline-none"
                  >
                    <option value={10}>
                      10 ocorrências
                    </option>

                    <option value={20}>
                      20 ocorrências
                    </option>

                    <option value={50}>
                      50 ocorrências
                    </option>

                    <option value={100}>
                      100 ocorrências
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={
                    handleBatch
                  }
                  disabled={
                    batchLoading ||
                    !health.available
                  }
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchLoading ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />

                      Processando
                    </>
                  ) : (
                    <>
                      <Play
                        size={17}
                      />

                      Processar apontamentos
                    </>
                  )}
                </button>
              </div>

              {batchError && (
                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {batchError}
                </div>
              )}

              {batchResult && (
                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-400">
                      Encontradas
                    </p>

                    <p className="mt-2 text-xl font-semibold text-neutral-950">
                      {batchResult.found}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-400">
                      Processadas
                    </p>

                    <p className="mt-2 text-xl font-semibold text-neutral-950">
                      {batchResult.processed}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-400">
                      Salvas
                    </p>

                    <p className="mt-2 text-xl font-semibold text-neutral-950">
                      {batchResult.inserted}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-400">
                      Erros
                    </p>

                    <p className="mt-2 text-xl font-semibold text-neutral-950">
                      {batchResult.failed}
                    </p>
                  </div>
                </div>
              )}
            </section>


            <section className="rounded-[28px] border border-black/5 bg-background-primary transition-colors p-7 shadow-sm">
              <div className="mb-7">
                <h2 className="text-lg font-semibold text-neutral-950">
                  Testar ocorrência manualmente
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                  Consulte o Modelo ML sem gravar uma sugestão no histórico.
                </p>
              </div>

              <form
                onSubmit={
                  handleSubmit
                }
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="observation"
                    className="mb-2 block text-sm font-medium text-neutral-700"
                  >
                    Ocorrência
                  </label>

                  <textarea
                    id="observation"
                    value={
                      observation
                    }
                    onChange={(
                      event,
                    ) =>
                      setObservation(
                        event.target.value,
                      )
                    }
                    placeholder="Ex.: QUEBROU ROLAMENTOS DA ESTEIRA DE SAIDA DO FORNO"
                    rows={5}
                    className="w-full resize-none rounded-2xl border border-neutral-200 bg-background-primary transition-colors px-4 py-3.5 text-sm text-neutral-950 outline-none transition focus:border-neutral-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="equipment"
                    className="mb-2 block text-sm font-medium text-neutral-700"
                  >
                    Equipamento
                  </label>

                  <input
                    id="equipment"
                    value={
                      equipment
                    }
                    onChange={(
                      event,
                    ) =>
                      setEquipment(
                        event.target.value,
                      )
                    }
                    placeholder="Opcional"
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-background-primary transition-colors px-4 text-sm outline-none transition focus:border-neutral-400"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    loading ||
                    !health.available
                  }
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#e41e2b] px-5 text-sm font-semibold text-white transition hover:bg-[#c91925] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />

                      Analisando
                    </>
                  ) : (
                    <>
                      <Search
                        size={17}
                      />

                      Analisar ocorrência
                    </>
                  )}
                </button>
              </form>

              {prediction && (
                <div className="mt-8 border-t border-neutral-100 pt-8">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    Sugestão do Modelo ML
                  </p>

                  <div className="flex flex-col gap-5 rounded-[24px] bg-neutral-950 p-6 text-white sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">
                        {prediction.failureMode}
                      </h3>

                      <p className="mt-2 text-sm text-white/55">
                        {prediction.failedComponentCode}
                      </p>
                    </div>

                    <div className="sm:text-right">
                      <p className="text-xs uppercase tracking-[0.12em] text-white/40">
                        Confiança
                      </p>

                      <p className="mt-1 text-2xl font-semibold">
                        {percentage(
                          prediction.confidence,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-7 space-y-3">
                    {prediction.topPredictions.map(
                      (
                        item,
                        index,
                      ) => (
                        <div
                          key={
                            item.failedComponentCode
                          }
                          className="flex items-center gap-4"
                        >
                          <div className="w-6 text-xs text-neutral-400">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-sm text-neutral-700">
                                {item.failureMode}
                              </span>

                              <span className="text-xs font-medium text-neutral-500">
                                {percentage(
                                  item.confidence,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-7 flex items-start gap-3 rounded-2xl bg-neutral-50 p-4">
                    <CheckCircle2
                      size={18}
                      className="mt-0.5 shrink-0 text-neutral-500"
                    />

                    <p className="text-sm leading-6 text-neutral-600">
                      Resultado somente para consulta. A revisão humana
                      continua obrigatória.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>


          <aside className="space-y-5">
            <div className="rounded-[28px] border border-black/5 bg-background-primary transition-colors p-6 shadow-sm">
              <p className="text-sm font-medium text-neutral-950">
                Status do modelo
              </p>

              <div className="mt-5 flex items-center gap-3">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    health.available
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }`}
                />

                <span className="text-sm text-neutral-700">
                  {health.loading
                    ? "Verificando..."
                    : health.available
                      ? "Disponível"
                      : "Indisponível"}
                </span>
              </div>

              <div className="mt-5 border-t border-neutral-100 pt-5">
                <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                  Versão
                </p>

                <p className="mt-2 text-sm font-medium text-neutral-800">
                  {health.modelVersion ??
                    "Não disponível"}
                </p>
              </div>
            </div>

            <div className="rounded-[28px] bg-[#e41e2b] p-6 text-white">
              <p className="text-sm font-semibold">
                Regra principal
              </p>

              <p className="mt-4 text-xl font-semibold">
                O que falhou?
              </p>

              <p className="mt-4 text-sm leading-6 text-white/80">
                O Modelo ML busca identificar o componente responsável
                pela ocorrência.
              </p>

              <p className="mt-6 text-sm font-medium">
                ROLAMENTO
                <br />
                → Falha de rolamento
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}