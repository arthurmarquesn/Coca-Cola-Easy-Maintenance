"use client";

import {
  CalendarDays,
  ChevronDown,
  Factory,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

interface ReliabilityToolbarProps {
  selectedUnitsLabel:
    string;

  startDate:
    string;

  endDate:
    string;

  line:
    string;

  equipment:
    string;

  lines:
    string[];

  equipments:
    string[];

  events:
    number;

  downtimeMinutes:
    number;

  loading:
    boolean;

  onStartDateChange: (
    value:
      string,
  ) => void;

  onEndDateChange: (
    value:
      string,
  ) => void;

  onLineChange: (
    value:
      string,
  ) => void;

  onEquipmentChange: (
    value:
      string,
  ) => void;

  onResetFilters:
    () => void;
}

/* =========================================================
   HELPERS
========================================================= */

function formatNumber(
  value:
    number,

  maximumFractionDigits =
    0,
): string {
  return new Intl
    .NumberFormat(
      "pt-BR",
      {
        maximumFractionDigits,
      },
    )
    .format(
      Number.isFinite(
        value,
      )
        ? value
        : 0,
    );
}

function formatMinutes(
  value:
    number,
): string {
  const safe =
    Number.isFinite(
      value,
    )
      ? Math.max(
          0,
          value,
        )
      : 0;

  if (
    safe >=
    60
  ) {
    return `${formatNumber(
      safe /
        60,
      1,
    )} h`;
  }

  return `${formatNumber(
    safe,
    1,
  )} min`;
}

function formatDate(
  value:
    string,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return value ||
      "—";
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

/* =========================================================
   COMPONENTE
========================================================= */

export function ReliabilityToolbar({
  selectedUnitsLabel,
  startDate,
  endDate,
  line,
  equipment,
  lines,
  equipments,
  events,
  downtimeMinutes,
  loading,
  onStartDateChange,
  onEndDateChange,
  onLineChange,
  onEquipmentChange,
  onResetFilters,
}: ReliabilityToolbarProps) {
  const [
    expanded,
    setExpanded,
  ] =
    useState(
      false,
    );

  /* =======================================================
     RESUMO DO RECORTE
  ======================================================= */

  const activeFilterCount =
    useMemo(
      () => {
        let count =
          0;

        if (
          startDate ||
          endDate
        ) {
          count +=
            1;
        }

        if (
          line
        ) {
          count +=
            1;
        }

        if (
          equipment
        ) {
          count +=
            1;
        }

        return count;
      },
      [
        startDate,
        endDate,
        line,
        equipment,
      ],
    );

  const periodLabel =
    useMemo(
      () => {
        if (
          !startDate &&
          !endDate
        ) {
          return "Período completo";
        }

        if (
          startDate &&
          endDate
        ) {
          return `${formatDate(
            startDate,
          )} — ${formatDate(
            endDate,
          )}`;
        }

        if (
          startDate
        ) {
          return `A partir de ${formatDate(
            startDate,
          )}`;
        }

        return `Até ${formatDate(
          endDate,
        )}`;
      },
      [
        startDate,
        endDate,
      ],
    );

  return (
    <section className="mt-5 overflow-hidden rounded-[18px] border border-border-theme bg-surface shadow-[0_8px_28px_rgba(28,31,34,0.025)]">
      {/* ===================================================
          SUMMARY / HEADER RECOLHÍVEL
      ==================================================== */}

      <button
        type="button"
        onClick={() =>
          setExpanded(
            (
              current,
            ) =>
              !current,
          )
        }
        aria-expanded={
          expanded
        }
        className="flex w-full items-center justify-between gap-5 px-4 py-3.5 text-left transition-colors hover:bg-background-primary sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-body">
            <SlidersHorizontal
              size={
                14
              }
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-text-primary">
                Filtros
              </p>

              {activeFilterCount >
                0 && (
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[8px] font-semibold text-text-secondary">
                  {
                    activeFilterCount
                  }{" "}
                  ativos
                </span>
              )}

              {loading && (
                <LoaderCircle
                  size={
                    11
                  }
                  className="animate-spin text-accent-primary"
                />
              )}
            </div>

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[8px] text-text-muted">
              <span className="truncate">
                {
                  selectedUnitsLabel
                }
              </span>

              <span className="text-text-muted">
                ·
              </span>

              <span>
                {
                  periodLabel
                }
              </span>

              {line && (
                <>
                  <span className="text-text-muted">
                    ·
                  </span>

                  <span className="truncate">
                    {
                      line
                    }
                  </span>
                </>
              )}

              {equipment && (
                <>
                  <span className="text-text-muted">
                    ·
                  </span>

                  <span className="truncate">
                    {
                      equipment
                    }
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden items-center gap-4 text-right md:flex">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Ocorrências
              </p>

              <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-text-primary">
                {formatNumber(
                  events,
                )}
              </p>
            </div>

            <div className="h-7 w-px bg-black/[0.055]" />

            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Parada
              </p>

              <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-text-primary">
                {formatMinutes(
                  downtimeMinutes,
                )}
              </p>
            </div>
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary">
            <ChevronDown
              size={
                15
              }
              className={[
                "transition-transform duration-200",
                expanded
                  ? "rotate-180"
                  : "",
              ].join(
                " ",
              )}
            />
          </div>
        </div>
      </button>

      {/* ===================================================
          CONTEÚDO DOS FILTROS
      ==================================================== */}

      <div
        className={[
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded
            ? "grid-rows-[1fr]"
            : "grid-rows-[0fr]",
        ].join(
          " ",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border-theme px-4 pb-5 pt-4 sm:px-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {/* =============================================
                  DATA INICIAL
              ============================================== */}

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  <CalendarDays
                    size={
                      11
                    }
                  />

                  Data inicial
                </span>

                <input
                  type="date"
                  value={
                    startDate
                  }
                  onChange={(
                    event,
                  ) =>
                    onStartDateChange(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-10 w-full rounded-[10px] border border-border-theme bg-background-primary px-3 text-[10px] text-text-primary outline-none transition focus:border-accent-primary/30 focus:bg-surface focus:ring-2 focus:ring-accent-primary/[0.06]"
                />
              </label>

              {/* =============================================
                  DATA FINAL
              ============================================== */}

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  <CalendarDays
                    size={
                      11
                    }
                  />

                  Data final
                </span>

                <input
                  type="date"
                  value={
                    endDate
                  }
                  onChange={(
                    event,
                  ) =>
                    onEndDateChange(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-10 w-full rounded-[10px] border border-border-theme bg-background-primary px-3 text-[10px] text-text-primary outline-none transition focus:border-accent-primary/30 focus:bg-surface focus:ring-2 focus:ring-accent-primary/[0.06]"
                />
              </label>

              {/* =============================================
                  LINHA
              ============================================== */}

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  <Factory
                    size={
                      11
                    }
                  />

                  Linha
                </span>

                <select
                  value={
                    line
                  }
                  onChange={(
                    event,
                  ) =>
                    onLineChange(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-10 w-full rounded-[10px] border border-border-theme bg-background-primary px-3 text-[10px] text-text-primary outline-none transition focus:border-accent-primary/30 focus:bg-surface focus:ring-2 focus:ring-accent-primary/[0.06]"
                >
                  <option value="">
                    Todas as linhas
                  </option>

                  {lines.map(
                    (
                      item,
                    ) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {
                          item
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              {/* =============================================
                  EQUIPAMENTO
              ============================================== */}

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  <Wrench
                    size={
                      11
                    }
                  />

                  Equipamento
                </span>

                <select
                  value={
                    equipment
                  }
                  onChange={(
                    event,
                  ) =>
                    onEquipmentChange(
                      event
                        .target
                        .value,
                    )
                  }
                  className="h-10 w-full rounded-[10px] border border-border-theme bg-background-primary px-3 text-[10px] text-text-primary outline-none transition focus:border-accent-primary/30 focus:bg-surface focus:ring-2 focus:ring-accent-primary/[0.06]"
                >
                  <option value="">
                    Todos os equipamentos
                  </option>

                  {equipments.map(
                    (
                      item,
                    ) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {
                          item
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            {/* =============================================
                FOOTER
            ============================================== */}

            <div className="mt-4 flex flex-col gap-3 border-t border-border-theme pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[8px] bg-surface-elevated px-2.5 py-1.5 text-[8px] font-medium text-text-secondary">
                  {
                    selectedUnitsLabel
                  }
                </span>

                {line && (
                  <span className="rounded-[8px] bg-surface-elevated px-2.5 py-1.5 text-[8px] font-medium text-text-secondary">
                    {
                      line
                    }
                  </span>
                )}

                {equipment && (
                  <span className="rounded-[8px] bg-accent-soft px-2.5 py-1.5 text-[8px] font-medium text-accent-primary">
                    {
                      equipment
                    }
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={
                  onResetFilters
                }
                className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-[9px] border border-border-theme bg-surface px-3 text-[9px] font-semibold text-text-body transition hover:bg-surface-elevated hover:text-text-primary sm:self-auto"
              >
                <RotateCcw
                  size={
                    12
                  }
                />

                Restaurar filtros
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}