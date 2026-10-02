"use client";

import {
  LoaderCircle,
  X,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";


export interface ReliabilityMaspSelection {
  analysisLevel:
    | "EQUIPMENT"
    | "FAILURE_MODE";
  groupLabel: string;
  occurrences: number;
  startDate: string;
  endDate: string;
  line: string;
  equipmentFilter: string;
  equipmentLabel: string;
}


interface ExistingMasp {
  id: number;
  title: string;
  status: string;
  eventCount: number;
}


interface CreateResponse {
  success?: boolean;
  message?: string;
  created?: boolean;
  id?: number;
  eventCount?: number;
  existingMasp?:
    ExistingMasp;
}


function formatDate(
  value: string,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return value ||
      "não informado";
  }

  const [
    year,
    month,
    day,
  ] =
    value.split(
      "-",
    );

  return `${day}/${month}/${year}`;
}


export function ReliabilityMaspDialog({
  selection,
  onClose,
}: {
  selection:
    ReliabilityMaspSelection;
  onClose: () => void;
}) {
  const router =
    useRouter();

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    existing,
    setExisting,
  ] =
    useState<
      ExistingMasp | null
    >(null);

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
          "Escape" &&
        !submitting
      ) {
        onClose();
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
  }, [
    onClose,
    submitting,
  ]);

  async function createMasp(
    allowDuplicate: boolean,
  ) {
    setSubmitting(
      true,
    );

    setError("");

    try {
      const response =
        await fetch(
          "/api/masp/from-reliability",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                analysisLevel:
                  selection.analysisLevel,
                groupLabel:
                  selection.groupLabel,
                startDate:
                  selection.startDate ||
                  null,
                endDate:
                  selection.endDate ||
                  null,
                line:
                  selection.line ||
                  null,
                equipment:
                  selection.equipmentFilter ||
                  null,
                allowDuplicate,
              }),
            cache:
              "no-store",
          },
        );

      const data =
        await response
          .json() as
          CreateResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
          "Não foi possível iniciar o MASP.",
        );
      }

      if (
        data.existingMasp &&
        !allowDuplicate
      ) {
        setExisting(
          data.existingMasp,
        );

        return;
      }

      const maspId =
        Number(
          data.id,
        );

      if (
        !Number.isInteger(
          maspId,
        ) ||
        maspId <=
          0
      ) {
        throw new Error(
          "O servidor não retornou o MASP criado.",
        );
      }

      router.push(
        `/dashboard/masp/${maspId}`,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Não foi possível iniciar o MASP.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reliability-masp-title"
    >
      <button
        type="button"
        aria-label="Fechar confirmação"
        disabled={
          submitting
        }
        onClick={
          onClose
        }
        className="absolute inset-0 h-full w-full bg-black/30 backdrop-blur-[2px]"
      />

      <section className="relative z-10 w-full max-w-[520px] rounded-[22px] border border-black/[0.06] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#E41E2B]">
              Confiabilidade → MASP
            </p>

            <h2
              id="reliability-masp-title"
              className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[#202327]"
            >
              {existing
                ? "MASP em andamento"
                : "Iniciar MASP"}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Fechar"
            disabled={
              submitting
            }
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#7E8389] hover:bg-[#F4F4F3] disabled:opacity-50"
          >
            <X
              size={17}
            />
          </button>
        </div>

        {existing ? (
          <div className="mt-6">
            <p className="text-[14px] font-medium leading-6 text-[#383C41]">
              Já existe um MASP em andamento para este problema.
            </p>

            <div className="mt-4 rounded-[14px] bg-[#F6F6F4] p-4">
              <p className="text-[12px] font-semibold text-[#303438]">
                MASP #{existing.id}
              </p>

              <p className="mt-1 text-[11px] leading-5 text-[#7E8389]">
                {existing.title}
                {" · "}
                {existing.eventCount}{" "}
                {existing.eventCount ===
                  1
                  ? "evento"
                  : "eventos"}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={() =>
                  router.push(
                    `/dashboard/masp/${existing.id}`,
                  )
                }
                className="flex h-12 items-center justify-center rounded-[12px] bg-[#E41E2B] px-4 text-[12px] font-semibold text-white hover:bg-[#CF1824] disabled:opacity-60"
              >
                Abrir MASP #{existing.id}
              </button>

              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={() =>
                  void createMasp(
                    true,
                  )
                }
                className="flex h-12 items-center justify-center gap-2 rounded-[12px] border border-[#DDE0E3] px-4 text-[12px] font-semibold text-[#4F5459] hover:bg-[#F7F7F6] disabled:opacity-60"
              >
                {submitting && (
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                )}

                Criar outro MASP
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <dl className="overflow-hidden rounded-[16px] border border-[#E5E7E9] bg-[#FAFAF9]">
              <div className="border-b border-[#E7E9EB] px-4 py-3.5">
                <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A9FA5]">
                  Problema
                </dt>
                <dd className="mt-1 text-[13px] font-medium leading-5 text-[#303438]">
                  {selection.groupLabel}
                </dd>
              </div>

              {selection.equipmentLabel && (
                <div className="border-b border-[#E7E9EB] px-4 py-3.5">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A9FA5]">
                    Equipamento
                  </dt>
                  <dd className="mt-1 text-[12px] text-[#4F5459]">
                    {selection.equipmentLabel}
                  </dd>
                </div>
              )}

              <div className="grid grid-cols-2 gap-px bg-[#E7E9EB]">
                <div className="bg-[#FAFAF9] px-4 py-3.5">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A9FA5]">
                    Eventos
                  </dt>
                  <dd className="mt-1 text-[12px] font-medium text-[#303438]">
                    {selection.occurrences}
                  </dd>
                </div>

                <div className="bg-[#FAFAF9] px-4 py-3.5">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9A9FA5]">
                    Período
                  </dt>
                  <dd className="mt-1 text-[11px] font-medium text-[#303438]">
                    {formatDate(
                      selection.startDate,
                    )}
                    {" – "}
                    {formatDate(
                      selection.endDate,
                    )}
                  </dd>
                </div>
              </div>
            </dl>

            <p className="mt-4 text-[11px] leading-5 text-[#858A90]">
              O MASP será criado com as ocorrências e os filtros deste ponto. Nenhuma seleção adicional será necessária.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={
                  onClose
                }
                className="h-11 rounded-[11px] border border-[#DDE0E3] px-5 text-[12px] font-semibold text-[#5E6369] disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={() =>
                  void createMasp(
                    false,
                  )
                }
                className="flex h-11 items-center justify-center gap-2 rounded-[11px] bg-[#E41E2B] px-5 text-[12px] font-semibold text-white hover:bg-[#CF1824] disabled:opacity-60"
              >
                {submitting && (
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                )}

                Criar MASP
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-[12px] border border-[#F0D2D5] bg-[#FFF8F8] px-3.5 py-3 text-[11px] leading-5 text-[#B52B34]">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
