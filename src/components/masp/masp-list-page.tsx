"use client";

import Link from "next/link";

import {
  ArrowRight,
  CirclePlus,
  ClipboardCheck,
  LoaderCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  MaspShell,
} from "@/components/masp/masp-shell";

import {
  MaspOptionsResponse,
  readApiResponse,
} from "@/components/masp/types";


interface MaspListItem {
  id: number;
  unit_id: number;
  unit_name: string;
  equipment_id:
    | number
    | null;
  equipment_name:
    | string
    | null;
  title: string;
  status: string;
  owner_name:
    | string
    | null;
  event_count: number;
  updated_at: string;
}

const STATUS_LABELS:
Record<string, string> = {
  DRAFT:
    "Rascunho",
  ANALYSIS:
    "Análise",
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

function statusClass(
  status: string,
): string {
  if (
    status ===
    "CLOSED"
  ) {
    return "bg-[#EDF7EF] text-[#39734A]";
  }

  if (
    status ===
    "CANCELLED"
  ) {
    return "bg-surface-elevated text-text-secondary";
  }

  if (
    status ===
      "EXECUTION" ||
    status ===
      "VERIFICATION"
  ) {
    return "bg-[#FFF5E2] text-[#94671B]";
  }

  return "bg-[#FFF0F1] text-[#B82C36]";
}

export function MaspListPage({
  userName,
  canCreate,
}: {
  userName: string;
  canCreate: boolean;
}) {
  const [
    items,
    setItems,
  ] =
    useState<
      MaspListItem[]
    >([]);
  const [
    options,
    setOptions,
  ] =
    useState<
      MaspOptionsResponse | null
    >(null);
  const [
    status,
    setStatus,
  ] =
    useState(
      "",
    );
  const [
    equipmentId,
    setEquipmentId,
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
          const query =
            new URLSearchParams();

          if (
            status
          ) {
            query.set(
              "status",
              status,
            );
          }

          if (
            equipmentId
          ) {
            query.set(
              "equipmentId",
              equipmentId,
            );
          }

          const [
            list,
            loadedOptions,
          ] =
            await Promise.all([
              fetch(
                `/api/masp?${query.toString()}`,
                {
                  cache:
                    "no-store",
                },
              ).then(
                (
                  response,
                ) =>
                  readApiResponse<{
                    items: MaspListItem[];
                  }>(
                    response,
                  ),
              ),
              options
                ? Promise.resolve(
                    options,
                  )
                : fetch(
                    "/api/masp/options",
                    {
                      cache:
                        "no-store",
                    },
                  ).then(
                    (
                      response,
                    ) =>
                      readApiResponse<MaspOptionsResponse>(
                        response,
                      ),
                  ),
            ]);

          setItems(
            list.items,
          );
          setOptions(
            loadedOptions,
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar os MASPs.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        equipmentId,
        options,
        status,
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

  const visibleEquipments =
    useMemo(
      () =>
        options
          ?.equipments ??
        [],
      [
        options,
      ],
    );

  return (
    <MaspShell
      userName={
        userName
      }
      title="Análises MASP"
      description="Conduza problemas reais da ocorrência à verificação, com evidências, causa raiz confirmada e plano 5W2H."
      actions={
        canCreate && (
        <Link
          href="/dashboard/masp/novo"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#E41E2B] px-5 text-[12px] font-semibold text-white transition-colors hover:bg-[#CB1924]"
        >
          <CirclePlus
            size={16}
          />
          Novo MASP
        </Link>
        )
      }
    >
      <div className="grid gap-3 rounded-[20px] border border-border-theme bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[220px_1fr_auto]">
        <select
          value={
            status
          }
          onChange={(
            event,
          ) =>
            setStatus(
              event.target.value,
            )
          }
          className="h-11 rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-[#D58B91]"
        >
          <option value="">
            Todos os status
          </option>
          {Object.entries(
            STATUS_LABELS,
          ).map(
            ([
              value,
              label,
            ]) => (
              <option
                key={
                  value
                }
                value={
                  value
                }
              >
                {label}
              </option>
            ),
          )}
        </select>

        <select
          value={
            equipmentId
          }
          onChange={(
            event,
          ) =>
            setEquipmentId(
              event.target.value,
            )
          }
          className="h-11 rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] text-text-primary outline-none focus:border-[#D58B91]"
        >
          <option value="">
            Todos os equipamentos
          </option>
          {visibleEquipments.map(
            (
              equipment,
            ) => (
              <option
                key={
                  equipment.id
                }
                value={
                  equipment.id
                }
              >
                {equipment.name}
              </option>
            ),
          )}
        </select>

        <button
          type="button"
          onClick={() =>
            void load()
          }
          className="h-11 rounded-[11px] border border-border-theme px-5 text-[12px] font-semibold text-text-primary hover:bg-surface-hover"
        >
          Aplicar filtros
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[12px] text-[#B52D36]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center gap-3 text-[13px] text-text-secondary">
          <LoaderCircle
            size={18}
            className="animate-spin text-[#E41E2B]"
          />
          Carregando análises...
        </div>
      ) : items.length ===
        0 ? (
        <div className="mt-5 flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border-theme bg-surface px-6 text-center">
          <ClipboardCheck
            size={28}
            className="text-text-secondary"
          />
          <h2 className="mt-4 text-[16px] font-semibold text-text-primary">
            Nenhum MASP encontrado
          </h2>
          <p className="mt-2 max-w-[420px] text-[12px] leading-6 text-text-secondary">
            Inicie uma análise manual ou selecione eventos reais para gerar a declaração do problema.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[22px] border border-border-theme bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-border-theme bg-surface-elevated text-left">
                  {[
                    "ID",
                    "Análise",
                    "Unidade",
                    "Equipamento",
                    "Status",
                    "Responsável",
                    "Atualizado",
                    "",
                  ].map(
                    (
                      label,
                    ) => (
                      <th
                        key={
                          label
                        }
                        className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-secondary first:pl-5 last:pr-5"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map(
                  (
                    item,
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      className="border-b border-border-theme last:border-b-0"
                    >
                      <td className="px-5 py-4 text-[11px] font-semibold text-text-secondary">
                        #{item.id}
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-[280px] text-[12px] font-semibold text-text-primary">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[9px] text-text-secondary">
                          {item.event_count} evento(s)
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[11px] text-text-primary">
                        {item.unit_name}
                      </td>
                      <td className="px-4 py-4 text-[11px] text-text-primary">
                        {item.equipment_name ??
                          "Não definido"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusClass(item.status)}`}>
                          {STATUS_LABELS[item.status] ??
                            item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[11px] text-text-primary">
                        {item.owner_name ??
                          "Sem responsável"}
                      </td>
                      <td className="px-4 py-4 text-[10px] text-text-secondary">
                        {new Intl.DateTimeFormat(
                          "pt-BR",
                          {
                            dateStyle:
                              "short",
                            timeStyle:
                              "short",
                          },
                        ).format(
                          new Date(
                            item.updated_at,
                          ),
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/dashboard/masp/${item.id}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-theme text-text-secondary hover:border-[#D7A7AB] hover:text-[#C92834]"
                          aria-label={`Abrir MASP ${item.id}`}
                        >
                          <ArrowRight
                            size={15}
                          />
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </MaspShell>
  );
}
