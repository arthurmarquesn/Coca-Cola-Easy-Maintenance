"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AlertTriangle,
  ArrowLeft,
  Database,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";


/* ============================================================
   TIPOS
============================================================ */

interface EquipmentCriticalityPageProps {
  userName:
    string;
}


interface ExposureData {
  occurrences:
    number;

  affectedEquipments:
    number;

  downtimeMinutes:
    number;
}


interface CriticalityResponse {
  success:
    boolean;

  message?:
    string;

  permissions: {
    role:
      string | null;

    canSync:
      boolean;
  };

  unit: {
    id:
      number;

    code:
      string | null;

    name:
      string | null;

    city:
      string | null;
  };

  matrix: {
    plantName:
      string | null;

    total:
      number;

    A:
      number;

    B:
      number;

    C:
      number;

    lastSync:
      string | null;
  };

  coverage: {
    totalEvents:
      number;

    linkedEvents:
      number;

    eventsWithCriticality:
      number;

    linkedPercentage:
      number;

    criticalityPercentage:
      number;
  };

  exposure: {
    A:
      ExposureData;

    B:
      ExposureData;

    C:
      ExposureData;
  };

  topCritical:
    Array<{
      equipmentId:
        number;

      equipment:
        string;

      code:
        string;

      occurrences:
        number;

      downtimeMinutes:
        number;

      mttr:
        number;
    }>;
}


interface SyncResult {
  fileName:
    string;

  centerSheet:
    string | null;

  matrixSheet:
    string;

  plantName:
    string;

  matrixAssets:
    number;

  matrixByCriticality: {
    A:
      number;

    B:
      number;

    C:
      number;
  };

  totalEvents:
    number;

  matchedEvents:
    number;

  matchedPercentage:
    number;

  matchedEquipmentNames:
    number;

  notFoundEquipmentNames:
    number;

  conflictingEquipmentNames:
    number;

  linkedEvents:
    number;
}


/* ============================================================
   HELPERS
============================================================ */

function formatNumber(
  value:
    number,

  digits =
    0,
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      minimumFractionDigits:
        0,

      maximumFractionDigits:
        digits,
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
  value:
    number,
) {
  return `${formatNumber(
    value,
    1,
  )}%`;
}


function formatDateTime(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return "Ainda não sincronizada";
  }

  const date =
    new Date(
      value,
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
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}


function classDescription(
  criticality:
    "A" |
    "B" |
    "C",
) {
  switch (
    criticality
  ) {
    case "A":
      return "Ativos críticos";

    case "B":
      return "Ativos importantes";

    case "C":
      return "Ativos de suporte";
  }
}


function classBadge(
  criticality:
    "A" |
    "B" |
    "C",
) {
  switch (
    criticality
  ) {
    case "A":
      return "border-[#EEC6CA] bg-[#FFF5F6] text-[#C12631]";

    case "B":
      return "border-[#EAD8A9] bg-[#FFFBEE] text-[#946F17]";

    case "C":
      return "border-[#CEE1D1] bg-[#F5FAF6] text-[#4F8158]";
  }
}


/* ============================================================
   COMPONENTES
============================================================ */

function MetricCard({
  label,
  value,
  description,
}: {
  label:
    string;

  value:
    string;

  description:
    string;
}) {
  return (
    <div className="rounded-[22px] border border-[#E5E7E9] bg-white p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-[#9A9FA5]">
        {label}
      </p>

      <p className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-[#222529]">
        {value}
      </p>

      <p className="mt-2 text-[11px] leading-5 text-[#989DA3]">
        {description}
      </p>
    </div>
  );
}


function ExposureCard({
  criticality,
  matrixAssets,
  data,
}: {
  criticality:
    "A" |
    "B" |
    "C";

  matrixAssets:
    number;

  data:
    ExposureData;
}) {
  return (
    <div className="rounded-[22px] border border-[#E5E7E9] bg-white p-5">
      <div className="flex items-start justify-between gap-5">
        <div>
          <span
            className={`inline-flex h-10 min-w-10 items-center justify-center rounded-[12px] border px-3 text-[15px] font-semibold ${classBadge(
              criticality,
            )}`}
          >
            {criticality}
          </span>

          <p className="mt-4 text-[13px] font-semibold text-[#33373B]">
            {classDescription(
              criticality,
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-semibold tracking-[-0.04em] text-[#292C30]">
            {formatNumber(
              matrixAssets,
            )}
          </p>

          <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[#A0A4A9]">
            na matriz
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#ECEDEF] pt-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.07em] text-[#9A9FA5]">
            Afetados
          </p>

          <p className="mt-2 text-[17px] font-semibold text-[#34383C]">
            {formatNumber(
              data
                .affectedEquipments,
            )}
          </p>
        </div>

        <div>
          <p className="text-[9px] uppercase tracking-[0.07em] text-[#9A9FA5]">
            Falhas
          </p>

          <p className="mt-2 text-[17px] font-semibold text-[#34383C]">
            {formatNumber(
              data.occurrences,
            )}
          </p>
        </div>

        <div>
          <p className="text-[9px] uppercase tracking-[0.07em] text-[#9A9FA5]">
            Downtime
          </p>

          <p className="mt-2 text-[17px] font-semibold text-[#34383C]">
            {formatNumber(
              data
                .downtimeMinutes,
              1,
            )}
          </p>

          <p className="mt-0.5 text-[9px] text-[#A0A4A9]">
            min
          </p>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   PÁGINA
============================================================ */

export function EquipmentCriticalityPage({
  userName,
}: EquipmentCriticalityPageProps) {
  const inputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const [
    data,
    setData,
  ] =
    useState<
      CriticalityResponse |
      null
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
    syncing,
    setSyncing,
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
    successMessage,
    setSuccessMessage,
  ] =
    useState(
      "",
    );

  const [
    syncResult,
    setSyncResult,
  ] =
    useState<
      SyncResult | null
    >(
      null,
    );


  /* ========================================================
     CARREGAR
  ======================================================== */

  const loadData =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        setError(
          "",
        );

        try {
          const response =
            await fetch(
              "/api/equipments/sync-criticality",
              {
                cache:
                  "no-store",
              },
            );

          const result =
            (
              await response.json()
            ) as
              CriticalityResponse;

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.message ??
              "Não foi possível carregar a análise.",
            );
          }

          setData(
            result,
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar a análise.",
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


  /* ========================================================
     SINCRONIZAR
  ======================================================== */

  async function synchronizeFile(
    file:
      File,
  ) {
    if (
      syncing
    ) {
      return;
    }

    setSyncing(
      true,
    );

    setError(
      "",
    );

    setSuccessMessage(
      "",
    );

    setSyncResult(
      null,
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/equipments/sync-criticality",
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.message ??
          "Não foi possível sincronizar a matriz.",
        );
      }

      setSyncResult(
        result.sync as
          SyncResult,
      );

      setSuccessMessage(
        result.message ??
        "Matriz sincronizada com sucesso.",
      );

      await loadData();
    } catch (
      syncError
    ) {
      setError(
        syncError instanceof
          Error
          ? syncError.message
          : "Não foi possível sincronizar a matriz.",
      );
    } finally {
      setSyncing(
        false,
      );

      if (
        inputRef.current
      ) {
        inputRef.current.value =
          "";
      }
    }
  }


  function handleFileChange(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target
        .files?.[0];

    if (
      !file
    ) {
      return;
    }

    void synchronizeFile(
      file,
    );
  }


  /* ========================================================
     LOADING
  ======================================================== */

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

          Carregando criticidade...
        </div>
      </main>
    );
  }


  /* ========================================================
     INTERFACE
  ======================================================== */

  return (
    <main className="min-h-screen bg-[#F7F7F6]">
      <header className="border-b border-black/[0.05] bg-white">
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

          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-[#25272A]">
              {userName}
            </p>

            {data?.unit.city && (
              <p className="mt-0.5 text-[11px] text-[#999DA2]">
                {data.unit.city}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-10 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

        <div className="mt-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Análise de criticidade
            </h1>

            <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-[#7D8288]">
              Cruze a criticidade oficial dos ativos com falhas,
              downtime e exposição operacional.
            </p>
          </div>

          {data
            ?.permissions
            .canSync && (
            <>
              <input
                ref={
                  inputRef
                }
                type="file"
                accept=".xlsx,.xlsm,.xls"
                onChange={
                  handleFileChange
                }
                className="hidden"
              />

              <button
                type="button"
                disabled={
                  syncing
                }
                onClick={() =>
                  inputRef
                    .current
                    ?.click()
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#E41E2B] px-5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? (
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <RefreshCw
                    size={15}
                  />
                )}

                {syncing
                  ? "Sincronizando..."
                  : "Sincronizar matriz"}
              </button>
            </>
          )}
        </div>

        {/* ==================================================
            STATUS DA FONTE
        =================================================== */}

        <div className="mt-8 flex flex-col gap-3 rounded-[18px] border border-[#E3E5E7] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#F5F5F4] text-[#555A60]">
              <Database
                size={18}
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[#3A3E43]">
                Matriz oficial
              </p>

              <p className="mt-1 text-[10px] text-[#979CA2]">
                {data
                  ?.matrix
                  .plantName
                  ? `Planta ${data.matrix.plantName}`
                  : "Nenhuma matriz sincronizada"}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-[9px] uppercase tracking-[0.08em] text-[#A0A4A9]">
              Última sincronização
            </p>

            <p className="mt-1 text-[11px] font-medium text-[#60656B]">
              {formatDateTime(
                data
                  ?.matrix
                  .lastSync ??
                null,
              )}
            </p>
          </div>
        </div>

        {/* ==================================================
            MENSAGENS
        =================================================== */}

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[11px] leading-5 text-[#B52D36]">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0"
            />

            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-[#D7E7DA] bg-[#F7FBF7] px-4 py-3 text-[11px] leading-5 text-[#52795A]">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0"
            />

            {successMessage}
          </div>
        )}

        {/* ==================================================
            RESULTADO DA SINCRONIZAÇÃO
        =================================================== */}

        {syncResult && (
          <div className="mt-5 rounded-[18px] border border-[#E3E5E7] bg-white p-5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet
                size={18}
                className="text-[#60656B]"
              />

              <div>
                <p className="text-[12px] font-semibold text-[#34383C]">
                  Sincronização concluída
                </p>

                <p className="mt-1 text-[10px] text-[#999DA2]">
                  {syncResult.fileName}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-t border-[#ECEDEF] pt-5 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Planta
                </p>

                <p className="mt-2 text-[13px] font-semibold text-[#3A3E43]">
                  {syncResult.plantName}
                </p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Ativos
                </p>

                <p className="mt-2 text-[13px] font-semibold text-[#3A3E43]">
                  {formatNumber(
                    syncResult
                      .matrixAssets,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Cobertura
                </p>

                <p className="mt-2 text-[13px] font-semibold text-[#3A3E43]">
                  {formatPercentage(
                    syncResult
                      .matchedPercentage,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Não localizados
                </p>

                <p className="mt-2 text-[13px] font-semibold text-[#3A3E43]">
                  {formatNumber(
                    syncResult
                      .notFoundEquipmentNames,
                  )}
                </p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Conflitos
                </p>

                <p className="mt-2 text-[13px] font-semibold text-[#3A3E43]">
                  {formatNumber(
                    syncResult
                      .conflictingEquipmentNames,
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================
            INDICADORES
        =================================================== */}

        {data && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Ativos na matriz"
                value={
                  formatNumber(
                    data.matrix
                      .total,
                  )
                }
                description="Quantidade de ativos cadastrados na matriz oficial da planta."
              />

              <MetricCard
                label="Classe A"
                value={
                  formatNumber(
                    data.matrix.A,
                  )
                }
                description="Ativos classificados como críticos pela matriz."
              />

              <MetricCard
                label="Cobertura"
                value={
                  formatPercentage(
                    data.coverage
                      .criticalityPercentage,
                  )
                }
                description="Percentual dos apontamentos com criticidade identificada."
              />

              <MetricCard
                label="Apontamentos vinculados"
                value={
                  `${formatNumber(
                    data.coverage
                      .linkedEvents,
                  )} / ${formatNumber(
                    data.coverage
                      .totalEvents,
                  )}`
                }
                description="Eventos relacionados ao cadastro de equipamentos."
              />
            </div>

            {/* ==============================================
                EXPOSIÇÃO
            =============================================== */}

            <div className="mt-10">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[#292C30]">
                  Exposição por criticidade
                </h2>

                <p className="mt-1.5 text-[11px] text-[#969BA1]">
                  Falhas e downtime ocorridos em cada classe de ativo.
                </p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <ExposureCard
                  criticality="A"
                  matrixAssets={
                    data.matrix.A
                  }
                  data={
                    data.exposure.A
                  }
                />

                <ExposureCard
                  criticality="B"
                  matrixAssets={
                    data.matrix.B
                  }
                  data={
                    data.exposure.B
                  }
                />

                <ExposureCard
                  criticality="C"
                  matrixAssets={
                    data.matrix.C
                  }
                  data={
                    data.exposure.C
                  }
                />
              </div>
            </div>

            {/* ==============================================
                TOP A
            =============================================== */}

            <div className="mt-10 overflow-hidden rounded-[22px] border border-[#E5E7E9] bg-white">
              <div className="border-b border-[#ECEDEF] px-5 py-4">
                <h2 className="text-[14px] font-semibold text-[#303438]">
                  Ativos críticos mais afetados
                </h2>

                <p className="mt-1 text-[10px] text-[#999DA2]">
                  Equipamentos classe A ordenados pelo maior tempo de parada.
                </p>
              </div>

              {data
                .topCritical
                .length ===
              0 ? (
                <div className="flex min-h-[200px] items-center justify-center px-6 text-center">
                  <p className="text-[11px] text-[#999DA2]">
                    Nenhum apontamento com criticidade A identificado.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#ECEDEF] bg-[#FAFAF9] text-left">
                        <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969BA1]">
                          Equipamento
                        </th>

                        <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969BA1]">
                          Falhas
                        </th>

                        <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969BA1]">
                          Downtime
                        </th>

                        <th className="px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969BA1]">
                          MTTR
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {data
                        .topCritical
                        .map(
                          (
                            item,
                            index,
                          ) => (
                            <tr
                              key={
                                item
                                  .equipmentId
                              }
                              className="border-b border-[#F0F1F2] last:border-b-0"
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#F5F5F4] text-[10px] font-semibold text-[#777C82]">
                                    {index +
                                      1}
                                  </span>

                                  <div>
                                    <p className="text-[11px] font-medium text-[#35393E]">
                                      {
                                        item
                                          .equipment
                                      }
                                    </p>

                                    <p className="mt-1 text-[9px] text-[#A0A4A9]">
                                      {
                                        item
                                          .code
                                      }
                                    </p>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-4 text-right text-[11px] font-medium text-[#555A60]">
                                {formatNumber(
                                  item
                                    .occurrences,
                                )}
                              </td>

                              <td className="px-4 py-4 text-right text-[11px] font-medium text-[#555A60]">
                                {formatNumber(
                                  item
                                    .downtimeMinutes,
                                  1,
                                )}{" "}
                                min
                              </td>

                              <td className="px-5 py-4 text-right text-[11px] font-medium text-[#555A60]">
                                {formatNumber(
                                  item
                                    .mttr,
                                  1,
                                )}{" "}
                                min
                              </td>
                            </tr>
                          ),
                        )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ==============================================
                QUALIDADE DOS DADOS
            =============================================== */}

            <div className="mt-6 rounded-[20px] border border-[#E5E7E9] bg-white p-5">
              <div className="flex items-start gap-3">
                <Upload
                  size={17}
                  className="mt-0.5 text-[#8B9096]"
                />

                <div>
                  <p className="text-[12px] font-semibold text-[#3A3E43]">
                    Cobertura da matriz
                  </p>

                  <p className="mt-2 max-w-[760px] text-[11px] leading-6 text-[#858A90]">
                    {formatNumber(
                      data.coverage
                        .eventsWithCriticality,
                    )}{" "}
                    de{" "}
                    {formatNumber(
                      data.coverage
                        .totalEvents,
                    )}{" "}
                    apontamentos possuem criticidade identificada,
                    equivalente a{" "}
                    {formatPercentage(
                      data.coverage
                        .criticalityPercentage,
                    )}
                    .
                  </p>

                  <p className="mt-1 text-[11px] leading-6 text-[#858A90]">
                    Os apontamentos sem correspondência segura permanecem sem
                    criticidade em vez de receberem uma classificação
                    estimada.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}