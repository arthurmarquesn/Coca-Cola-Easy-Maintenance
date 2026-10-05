"use client";

import {
  useRouter,
} from "next/navigation";

import {
  CalendarDays,
  Check,
  LoaderCircle,
  Search,
} from "lucide-react";

import {
  FormEvent,
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


export function MaspCreatePage({
  userName,
  initialEventId,
}: {
  userName: string;
  initialEventId:
    | number
    | null;
}) {
  const router =
    useRouter();
  const [
    options,
    setOptions,
  ] =
    useState<
      MaspOptionsResponse | null
    >(null);
  const [
    unitId,
    setUnitId,
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
    productionLineId,
    setProductionLineId,
  ] =
    useState(
      "",
    );
  const [
    ownerUserId,
    setOwnerUserId,
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
    problemStatement,
    setProblemStatement,
  ] =
    useState(
      "",
    );
  const [
    eventSearch,
    setEventSearch,
  ] =
    useState(
      "",
    );
  const [
    selectedEvents,
    setSelectedEvents,
  ] =
    useState<Set<number>>(
      new Set(
        initialEventId
          ? [
              initialEventId,
            ]
          : [],
      ),
    );
  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );
  const [
    saving,
    setSaving,
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

  useEffect(
    () => {
      async function loadOptions() {
        try {
          const loaded =
            await fetch(
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
            );

          setOptions(
            loaded,
          );

          const event =
            initialEventId
              ? loaded
                  .recentEvents
                  .find(
                    (
                      item,
                    ) =>
                      item.id ===
                      initialEventId,
                  )
              : null;

          if (
            event
          ) {
            setUnitId(
              String(
                event.unit_id,
              ),
            );
          } else if (
            loaded.units.length ===
            1
          ) {
            setUnitId(
              String(
                loaded.units[0]
                  .id,
              ),
            );
          }
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar os dados.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      }

      void loadOptions();
    },
    [
      initialEventId,
    ],
  );

  const numericUnitId =
    Number(
      unitId,
    );

  const visibleEvents =
    useMemo(
      () => {
        const query =
          eventSearch
            .trim()
            .toLocaleLowerCase(
              "pt-BR",
            );

        return (
          options
            ?.recentEvents ??
          []
        )
          .filter(
            (
              event,
            ) =>
              !numericUnitId ||
              event.unit_id ===
                numericUnitId,
          )
          .filter(
            (
              event,
            ) =>
              !query ||
              [
                String(
                  event.id,
                ),
                event.equipment_name,
                event.line_name,
                event.observation,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  " ",
                )
                .toLocaleLowerCase(
                  "pt-BR",
                )
                .includes(
                  query,
                ),
          )
          .slice(
            0,
            80,
          );
      },
      [
        eventSearch,
        numericUnitId,
        options,
      ],
    );

  const equipments =
    options
      ?.equipments
      .filter(
        (
          item,
        ) =>
          item.unit_id ===
          numericUnitId,
      ) ??
    [];

  const lines =
    options
      ?.productionLines
      .filter(
        (
          item,
        ) =>
          item.unit_id ===
          numericUnitId,
      ) ??
    [];

  const users =
    options
      ?.users
      .filter(
        (
          item,
        ) =>
          item.unit_id ===
          numericUnitId,
      ) ??
    [];

  function changeUnit(
    value: string,
  ) {
    setUnitId(
      value,
    );
    setEquipmentId(
      "",
    );
    setProductionLineId(
      "",
    );
    setOwnerUserId(
      "",
    );
    setSelectedEvents(
      new Set(),
    );
  }

  function toggleEvent(
    eventId: number,
  ) {
    setSelectedEvents(
      (
        current,
      ) => {
        const next =
          new Set(
            current,
          );

        if (
          next.has(
            eventId,
          )
        ) {
          next.delete(
            eventId,
          );
        } else {
          next.add(
            eventId,
          );
        }

        return next;
      },
    );
  }

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    setSaving(
      true,
    );
    setError(
      "",
    );

    try {
      const result =
        await fetch(
          "/api/masp",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                unitId:
                  numericUnitId ||
                  null,
                equipmentId:
                  equipmentId ||
                  null,
                productionLineId:
                  productionLineId ||
                  null,
                ownerUserId:
                  ownerUserId ||
                  null,
                title,
                problemStatement,
                eventIds: [
                  ...selectedEvents,
                ],
              }),
          },
        ).then(
          (
            response,
          ) =>
            readApiResponse<{
              id: number;
            }>(
              response,
            ),
        );

      router.push(
        `/dashboard/masp/${result.id}`,
      );
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof
          Error
          ? saveError.message
          : "Não foi possível criar o MASP.",
      );
      setSaving(
        false,
      );
    }
  }

  return (
    <MaspShell
      userName={
        userName
      }
      title="Novo MASP"
      description="Defina o problema manualmente ou relacione ocorrências reais para gerar uma descrição determinística."
      backHref="/dashboard/masp"
    >
      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center gap-3 text-[13px] text-text-secondary">
          <LoaderCircle
            size={18}
            className="animate-spin text-[#E41E2B]"
          />
          Preparando formulário...
        </div>
      ) : (
        <form
          onSubmit={
            submit
          }
          className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <div className="space-y-5">
            <section className="rounded-[22px] border border-border-theme bg-surface p-6">
              <h2 className="text-[15px] font-semibold text-text-primary">
                Contexto da análise
              </h2>
              <p className="mt-2 text-[11px] leading-5 text-text-secondary">
                A unidade é validada no servidor. Equipamentos, linhas e responsáveis são limitados à unidade escolhida.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-[11px] font-medium text-text-primary">
                  Unidade
                  <select
                    required
                    value={
                      unitId
                    }
                    onChange={(
                      event,
                    ) =>
                      changeUnit(
                        event.target.value,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] outline-none focus:border-[#D58B91]"
                  >
                    <option value="">
                      Selecione
                    </option>
                    {options?.units.map(
                      (
                        unit,
                      ) => (
                        <option
                          key={
                            unit.id
                          }
                          value={
                            unit.id
                          }
                        >
                          {unit.city ??
                            unit.name} — {unit.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="text-[11px] font-medium text-text-primary">
                  Equipamento
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
                    className="mt-2 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] outline-none focus:border-[#D58B91]"
                  >
                    <option value="">
                      Detectar pelos eventos
                    </option>
                    {equipments.map(
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
                </label>

                <label className="text-[11px] font-medium text-text-primary">
                  Linha
                  <select
                    value={
                      productionLineId
                    }
                    onChange={(
                      event,
                    ) =>
                      setProductionLineId(
                        event.target.value,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] outline-none focus:border-[#D58B91]"
                  >
                    <option value="">
                      Detectar pelos eventos
                    </option>
                    {lines.map(
                      (
                        line,
                      ) => (
                        <option
                          key={
                            line.id
                          }
                          value={
                            line.id
                          }
                        >
                          {line.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="text-[11px] font-medium text-text-primary">
                  Responsável
                  <select
                    value={
                      ownerUserId
                    }
                    onChange={(
                      event,
                    ) =>
                      setOwnerUserId(
                        event.target.value,
                      )
                    }
                    className="mt-2 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[12px] outline-none focus:border-[#D58B91]"
                  >
                    <option value="">
                      Definir depois
                    </option>
                    {users.map(
                      (
                        user,
                      ) => (
                        <option
                          key={
                            user.id
                          }
                          value={
                            user.id
                          }
                        >
                          {user.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <label className="mt-4 block text-[11px] font-medium text-text-primary">
                Título
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
                  maxLength={180}
                  placeholder="Gerado automaticamente se ficar vazio"
                  className="mt-2 h-11 w-full rounded-[11px] border border-border-theme px-3 text-[12px] outline-none focus:border-[#D58B91]"
                />
              </label>

              <label className="mt-4 block text-[11px] font-medium text-text-primary">
                Declaração do problema
                <textarea
                  value={
                    problemStatement
                  }
                  onChange={(
                    event,
                  ) =>
                    setProblemStatement(
                      event.target.value,
                    )
                  }
                  rows={5}
                  placeholder="Se houver eventos selecionados, o sistema monta uma frase apenas com os dados conhecidos."
                  className="mt-2 w-full rounded-[11px] border border-border-theme px-3 py-3 text-[12px] leading-5 outline-none focus:border-[#D58B91]"
                />
              </label>
            </section>

            {error && (
              <div className="rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[12px] text-[#B52D36]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                saving
              }
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-[#E41E2B] px-5 text-[12px] font-semibold text-white hover:bg-[#CB1924] disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <Check
                  size={16}
                />
              )}
              {saving
                ? "Criando análise..."
                : "Criar MASP"}
            </button>
          </div>

          <section className="rounded-[22px] border border-border-theme bg-surface p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">
                  Ocorrências relacionadas
                </h2>
                <p className="mt-2 text-[11px] leading-5 text-text-secondary">
                  {selectedEvents.size} selecionada(s). A lista mostra os 300 eventos locais mais recentes.
                </p>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                />
                <input
                  value={
                    eventSearch
                  }
                  onChange={(
                    event,
                  ) =>
                    setEventSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Buscar evento"
                  className="h-10 w-full rounded-[10px] border border-border-theme pl-9 pr-3 text-[11px] outline-none sm:w-[220px]"
                />
              </div>
            </div>

            <div className="mt-5 max-h-[650px] space-y-2 overflow-y-auto pr-1">
              {visibleEvents.map(
                (
                  event,
                ) => {
                  const selected =
                    selectedEvents.has(
                      event.id,
                    );

                  return (
                    <button
                      key={
                        event.id
                      }
                      type="button"
                      onClick={() =>
                        toggleEvent(
                          event.id,
                        )
                      }
                      className={`w-full rounded-[14px] border p-4 text-left transition-colors ${selected ? "border-[#E5A6AC] bg-accent-primary/5" : "border-border-theme hover:bg-surface-hover"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${selected ? "border-[#E41E2B] bg-[#E41E2B] text-white" : "border-border-theme"}`}>
                          {selected && (
                            <Check
                              size={12}
                            />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[9px] font-medium text-text-secondary">
                            <span>
                              #{event.id}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays
                                size={11}
                              />
                              {String(
                                event.event_date,
                              ).slice(
                                0,
                                10,
                              )}
                            </span>
                            <span>
                              {Number(
                                event.downtime_minutes ?? 0,
                              ).toLocaleString(
                                "pt-BR",
                                {
                                  maximumFractionDigits: 1,
                                },
                              )} min
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold text-text-primary">
                            {event.equipment_name ??
                              "Equipamento não informado"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-text-secondary">
                            {event.observation ??
                              "Sem observação"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                },
              )}

              {visibleEvents.length ===
                0 && (
                <div className="rounded-[14px] border border-dashed border-border-theme px-5 py-12 text-center text-[11px] text-text-secondary">
                  Selecione uma unidade ou ajuste a busca.
                </div>
              )}
            </div>
          </section>
        </form>
      )}
    </MaspShell>
  );
}
