"use client";

import {
  Building2,
  CalendarRange,
  Check,
  FileDown,
  LoaderCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ReportMetricSelector,
  type ReportMetric,
} from "@/components/reports/report-metric-selector";

interface ReportUnit {
  id: number;
  code: string | null;
  sapCode: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

interface ReportOptionsResponse {
  success: boolean;
  message?: string;
  units?: ReportUnit[];
  lines?: string[];
  equipments?: string[];
}

interface ReportGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
  initialUnitIds?: number[];
}

const DEFAULT_METRICS: ReportMetric[] = [
  "SUMMARY",
  "UNIT_COMPARISON",
  "PARETO",
  "JACK_KNIFE",
  "CRITICALITY",
  "FAILURE_MODES",
];

function formatUnitLabel(
  unit: ReportUnit,
) {
  return (
    unit.city?.trim() ||
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}

function fallbackDateRange() {
  const end =
    new Date();

  const start =
    new Date();

  start.setDate(
    start.getDate() -
      29,
  );

  function toInput(
    date: Date,
  ) {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() +
          1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        date.getDate(),
      ).padStart(
        2,
        "0",
      );

    return `${year}-${month}-${day}`;
  }

  return {
    start:
      toInput(
        start,
      ),
    end:
      toInput(
        end,
      ),
  };
}

function filenameFromResponse(
  response: Response,
): string {
  const disposition =
    response.headers.get(
      "Content-Disposition",
    );

  if (
    disposition
  ) {
    const utf8Match =
      disposition.match(
        /filename\*=UTF-8''([^;]+)/i,
      );

    if (
      utf8Match?.[1]
    ) {
      try {
        return decodeURIComponent(
          utf8Match[1],
        );
      } catch {
        // fallback abaixo
      }
    }

    const plainMatch =
      disposition.match(
        /filename="?([^";]+)"?/i,
      );

    if (
      plainMatch?.[1]
    ) {
      return plainMatch[1];
    }
  }

  return "relatorio-manutencao.pdf";
}

export function ReportGeneratorModal({
  open,
  onClose,
  initialStartDate,
  initialEndDate,
  initialUnitIds = [],
}: ReportGeneratorModalProps) {
  const fallbackRange =
    useMemo(
      () =>
        fallbackDateRange(),
      [],
    );

  const [
    units,
    setUnits,
  ] =
    useState<
      ReportUnit[]
    >([]);

  const [
    lines,
    setLines,
  ] =
    useState<
      string[]
    >([]);

  const [
    equipments,
    setEquipments,
  ] =
    useState<
      string[]
    >([]);

  const [
    selectedUnitIds,
    setSelectedUnitIds,
  ] =
    useState<
      number[]
    >([]);

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      initialStartDate ||
        fallbackRange.start,
    );

  const [
    endDate,
    setEndDate,
  ] =
    useState(
      initialEndDate ||
        fallbackRange.end,
    );

  const [
    line,
    setLine,
  ] =
    useState("");

  const [
    equipment,
    setEquipment,
  ] =
    useState("");

  const [
    metrics,
    setMetrics,
  ] =
    useState<
      ReportMetric[]
    >(
      DEFAULT_METRICS,
    );

  const [
    loadingOptions,
    setLoadingOptions,
  ] =
    useState(false);

  const [
    generating,
    setGenerating,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const selectedSet =
    useMemo(
      () =>
        new Set(
          selectedUnitIds,
        ),
      [
        selectedUnitIds,
      ],
    );

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    setStartDate(
      initialStartDate ||
        fallbackRange.start,
    );

    setEndDate(
      initialEndDate ||
        fallbackRange.end,
    );

    setLine("");
    setEquipment("");
    setMetrics(
      DEFAULT_METRICS,
    );
    setError("");

    const controller =
      new AbortController();

    async function loadOptions() {
      setLoadingOptions(
        true,
      );

      try {
        const response =
          await fetch(
            "/api/reports/maintenance",
            {
              method: "GET",
              cache: "no-store",
              signal:
                controller.signal,
            },
          );

        const data =
          (await response.json()) as
            ReportOptionsResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ??
              "Não foi possível carregar as opções do relatório.",
          );
        }

        const loadedUnits =
          Array.isArray(
            data.units,
          )
            ? data.units
            : [];

        setUnits(
          loadedUnits,
        );

        setLines(
          Array.isArray(
            data.lines,
          )
            ? data.lines
            : [],
        );

        setEquipments(
          Array.isArray(
            data.equipments,
          )
            ? data.equipments
            : [],
        );

        const accessibleIds =
          new Set(
            loadedUnits.map(
              (
                item,
              ) =>
                item.id,
            ),
          );

        const validInitial =
          initialUnitIds.filter(
            (
              id,
            ) =>
              accessibleIds.has(
                id,
              ),
          );

        setSelectedUnitIds(
          validInitial.length >
            0
            ? validInitial
            : loadedUnits.map(
                (
                  item,
                ) =>
                  item.id,
              ),
        );
      } catch (
        loadError
      ) {
        if (
          loadError instanceof
            DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        setError(
          loadError instanceof
            Error
            ? loadError.message
            : "Não foi possível carregar as opções do relatório.",
        );
      } finally {
        if (
          !controller.signal
            .aborted
        ) {
          setLoadingOptions(
            false,
          );
        }
      }
    }

    void loadOptions();

    return () => {
      controller.abort();
    };
  }, [
    open,
    initialStartDate,
    initialEndDate,
    initialUnitIds,
    fallbackRange.end,
    fallbackRange.start,
  ]);

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
          "Escape" &&
        !generating
      ) {
        onClose();
      }
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    open,
    generating,
    onClose,
  ]);

  if (
    !open
  ) {
    return null;
  }

  function toggleUnit(
    id: number,
  ) {
    setSelectedUnitIds(
      (
        current,
      ) =>
        current.includes(
          id,
        )
          ? current.filter(
              (
                item,
              ) =>
                item !==
                id,
            )
          : [
              ...current,
              id,
            ],
    );
  }

  function selectAllUnits() {
    setSelectedUnitIds(
      units.map(
        (
          item,
        ) =>
          item.id,
      ),
    );
  }

  async function generateReport() {
    if (
      generating
    ) {
      return;
    }

    setError("");

    if (
      selectedUnitIds.length ===
      0
    ) {
      setError(
        "Selecione pelo menos uma unidade.",
      );

      return;
    }

    if (
      !startDate ||
      !endDate
    ) {
      setError(
        "Informe o período do relatório.",
      );

      return;
    }

    if (
      startDate >
      endDate
    ) {
      setError(
        "A data inicial não pode ser posterior à data final.",
      );

      return;
    }

    if (
      metrics.length ===
      0
    ) {
      setError(
        "Selecione pelo menos uma métrica para o documento.",
      );

      return;
    }

    setGenerating(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/reports/maintenance",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                unitIds:
                  selectedUnitIds,
                startDate,
                endDate,
                line:
                  line ||
                  null,
                equipment:
                  equipment ||
                  null,
                metrics,
              }),
          },
        );

      const contentType =
        response.headers.get(
          "Content-Type",
        ) ??
        "";

      if (
        !response.ok
      ) {
        if (
          contentType.includes(
            "application/json",
          )
        ) {
          const body =
            (await response.json()) as {
              message?: string;
              error?: string;
            };

          throw new Error(
            body.message ??
              body.error ??
              "Não foi possível gerar o relatório.",
          );
        }

        throw new Error(
          "Não foi possível gerar o relatório.",
        );
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(
          blob,
        );

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        url;

      anchor.download =
        filenameFromResponse(
          response,
        );

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url,
          ),
        1000,
      );

      onClose();
    } catch (
      generateError
    ) {
      setError(
        generateError instanceof
          Error
          ? generateError.message
          : "Não foi possível gerar o relatório.",
      );
    } finally {
      setGenerating(
        false,
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Gerar relatório de manutenção"
    >
      <button
        type="button"
        aria-label="Fechar relatório"
        disabled={
          generating
        }
        onClick={
          onClose
        }
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[3px] disabled:cursor-wait"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-[1060px] flex-col overflow-hidden rounded-[26px] border border-border-theme/[0.06] bg-surface-elevated shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-6 border-b border-border-theme bg-surface px-6 py-5 sm:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#FFF0F1] text-[#E41E2B]">
                <FileDown
                  size={18}
                />
              </span>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-text-secondary">
                  Documento executivo
                </p>

                <h2 className="mt-0.5 text-[21px] font-semibold tracking-[-0.035em] text-text-primary">
                  Gerar relatório de manutenção
                </h2>
              </div>
            </div>

            <p className="mt-3 max-w-[650px] text-[11px] leading-5 text-text-secondary">
              Defina unidades, período, filtros operacionais e os blocos que devem compor o PDF.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              generating
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            <X
              size={18}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {loadingOptions ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="flex items-center gap-3 text-[12px] text-text-secondary">
                <LoaderCircle
                  size={18}
                  className="animate-spin text-[#E41E2B]"
                />

                Carregando opções do relatório...
              </div>
            </div>
          ) : (
            <div className="space-y-7">
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Building2
                      size={17}
                      className="text-text-secondary"
                    />

                    <div>
                      <h3 className="text-[13px] font-semibold text-text-primary">
                        Unidades
                      </h3>

                      <p className="mt-0.5 text-[10px] text-text-secondary">
                        Apenas unidades vinculadas ao seu usuário podem ser incluídas.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface px-2.5 py-1 text-[9px] font-semibold text-text-secondary shadow-sm">
                      {selectedUnitIds.length}/{units.length}
                    </span>

                    <button
                      type="button"
                      onClick={
                        selectAllUnits
                      }
                      className="text-[10px] font-semibold text-[#B72831] hover:text-[#E41E2B]"
                    >
                      Selecionar todas
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {units.map(
                    (
                      availableUnit,
                    ) => {
                      const checked =
                        selectedSet.has(
                          availableUnit.id,
                        );

                      return (
                        <button
                          key={
                            availableUnit.id
                          }
                          type="button"
                          onClick={() =>
                            toggleUnit(
                              availableUnit.id,
                            )
                          }
                          className={[
                            "flex min-h-[72px] items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors",
                            checked
                              ? "border-[#E7B5B9] bg-[#FFF9F9]"
                              : "border-border-theme bg-surface hover:border-border-theme",
                          ].join(
                            " ",
                          )}
                        >
                          <span
                            className={[
                              "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border",
                              checked
                                ? "border-[#E41E2B] bg-[#E41E2B] text-white"
                                : "border-border-theme bg-surface text-transparent",
                            ].join(
                              " ",
                            )}
                          >
                            <Check
                              size={12}
                              strokeWidth={2.5}
                            />
                          </span>

                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold text-text-primary">
                              {formatUnitLabel(
                                availableUnit,
                              )}
                            </span>

                            <span className="mt-0.5 block truncate text-[9px] text-text-secondary">
                              {[
                                availableUnit.code,
                                availableUnit.sapCode,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " · ",
                                )}
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </section>

              <section className="border-t border-border-theme pt-6">
                <div className="flex items-center gap-2.5">
                  <CalendarRange
                    size={17}
                    className="text-text-secondary"
                  />

                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      Período
                    </h3>

                    <p className="mt-0.5 text-[10px] text-text-secondary">
                      O recorte de datas será aplicado a todas as métricas do documento.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      De
                    </span>

                    <input
                      type="date"
                      value={
                        startDate
                      }
                      max={
                        endDate ||
                        undefined
                      }
                      onChange={(
                        event,
                      ) =>
                        setStartDate(
                          event.target.value,
                        )
                      }
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[11px] text-text-primary outline-none focus:border-border-theme"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      Até
                    </span>

                    <input
                      type="date"
                      value={
                        endDate
                      }
                      min={
                        startDate ||
                        undefined
                      }
                      onChange={(
                        event,
                      ) =>
                        setEndDate(
                          event.target.value,
                        )
                      }
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[11px] text-text-primary outline-none focus:border-border-theme"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      Linha
                    </span>

                    <select
                      value={
                        line
                      }
                      onChange={(
                        event,
                      ) => {
                        setLine(
                          event.target.value,
                        );

                        setEquipment("");
                      }}
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[11px] text-text-primary outline-none focus:border-border-theme"
                    >
                      <option value="">
                        Todas as linhas
                      </option>

                      {lines.map(
                        (
                          option,
                        ) => (
                          <option
                            key={
                              option
                            }
                            value={
                              option
                            }
                          >
                            {option}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      Equipamento
                    </span>

                    <select
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
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-border-theme bg-surface px-3 text-[11px] text-text-primary outline-none focus:border-border-theme"
                    >
                      <option value="">
                        Todos os equipamentos
                      </option>

                      {equipments.map(
                        (
                          option,
                        ) => (
                          <option
                            key={
                              option
                            }
                            value={
                              option
                            }
                          >
                            {option}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              </section>

              <section className="border-t border-border-theme pt-6">
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal
                    size={17}
                    className="text-text-secondary"
                  />

                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      Conteúdo do PDF
                    </h3>

                    <p className="mt-0.5 text-[10px] text-text-secondary">
                      Marque os blocos que devem compor a versão executiva do relatório.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <ReportMetricSelector
                    value={
                      metrics
                    }
                    onChange={
                      setMetrics
                    }
                  />
                </div>
              </section>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-[13px] border border-[#F0C7CA] bg-[#FFF5F5] px-4 py-3 text-[11px] leading-5 text-[#B72B34]">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border-theme bg-surface px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-[9px] leading-4 text-text-secondary">
            O PDF será gerado com os dados disponíveis no banco no momento da emissão.
          </p>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                generating
              }
              className="h-11 rounded-[11px] border border-border-theme bg-surface px-5 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() =>
                void generateReport()
              }
              disabled={
                loadingOptions ||
                generating
              }
              className="inline-flex h-11 min-w-[178px] items-center justify-center gap-2 rounded-[11px] bg-[#E41E2B] px-5 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(228,30,43,0.18)] transition-colors hover:bg-[#CF1824] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown
                    size={15}
                  />
                  Gerar relatório PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
