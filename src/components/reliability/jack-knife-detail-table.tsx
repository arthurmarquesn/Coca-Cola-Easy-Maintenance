"use client";

import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

export type JackKnifeQuadrant =
  | "CRITICA"
  | "CRITICA_E_CRONICA"
  | "BAIXA_RELEVANCIA"
  | "CRONICA";

export interface JackKnifeDetailItem {
  label: string;
  frequency: number;
  downtimeMinutes: number;
  mttr: number;
  quadrant: JackKnifeQuadrant;
}

interface JackKnifeDetailTableProps {
  items: JackKnifeDetailItem[];

  analysisLevel:
    | "EQUIPMENT"
    | "FAILURE_MODE";

  startDate?:
    | string
    | null;

  endDate?:
    | string
    | null;

  line?:
    | string
    | null;

  onSelect?: (
    item: JackKnifeDetailItem,
    originalIndex: number,
  ) => void;
}

type CategoryFilter =
  | "ALL"
  | JackKnifeQuadrant;

const PAGE_SIZE =
  40;

function formatNumber(
  value: number,
  maximumFractionDigits = 0,
): string {
  const safe =
    Number.isFinite(
      value,
    )
      ? value
      : 0;

  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits,
    },
  ).format(
    safe,
  );
}

function formatDate(
  value?:
    | string
    | null,
): string {
  if (!value) {
    return "Não informado";
  }

  const parts =
    value.split(
      "-",
    );

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function quadrantLabel(
  quadrant:
    JackKnifeQuadrant,
): string {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return "Crítico-crônico";

    case "CRITICA":
      return "Crítico";

    case "CRONICA":
      return "Crônico";

    case "BAIXA_RELEVANCIA":

    default:
      return "Conforto";
  }
}

function quadrantClasses(
  quadrant:
    JackKnifeQuadrant,
): string {
  switch (
    quadrant
  ) {
    case "CRITICA_E_CRONICA":
      return "border-accent-primary/30 bg-accent-soft text-accent-primary";

    case "CRITICA":
      return "border-warning/30 bg-warning/10 text-warning";

    case "CRONICA":
      return "border-chart-neutral/30 bg-chart-neutral/10 text-chart-neutral";

    case "BAIXA_RELEVANCIA":

    default:
      return "border-success/30 bg-success/10 text-success";
  }
}

function categoryButtonClasses(
  active:
    boolean,
): string {
  return active
    ? "border-text-primary bg-surface-inverse text-white"
    : "border-border-theme bg-surface text-text-body hover:bg-background-primary";
}

export function JackKnifeDetailTable({
  items,
  analysisLevel,
  startDate,
  endDate,
  line,
  onSelect,
}: JackKnifeDetailTableProps) {
  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );

  const [
    category,
    setCategory,
  ] =
    useState<
      CategoryFilter
    >(
      "ALL",
    );

  const [
    page,
    setPage,
  ] =
    useState(
      0,
    );

  /*
   * Mantemos o índice original porque o drawer da
   * página trabalha com o índice original do Jack-Knife.
   *
   * A tabela, porém, é explicitamente ordenada pelo
   * maior tempo total de parada.
   */
  const indexedItems =
    useMemo(
      () =>
        items
          .map(
            (
              item,
              originalIndex,
            ) => ({
              item,
              originalIndex,
            }),
          )
          .sort(
            (
              a,
              b,
            ) => {
              if (
                b.item
                  .downtimeMinutes !==
                a.item
                  .downtimeMinutes
              ) {
                return (
                  b.item
                    .downtimeMinutes -
                  a.item
                    .downtimeMinutes
                );
              }

              if (
                b.item
                  .frequency !==
                a.item
                  .frequency
              ) {
                return (
                  b.item
                    .frequency -
                  a.item
                    .frequency
                );
              }

              return a.item
                .label
                .localeCompare(
                  b.item
                    .label,
                  "pt-BR",
                );
            },
          ),
      [
        items,
      ],
    );

  const filteredItems =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLocaleLowerCase(
              "pt-BR",
            );

        return indexedItems.filter(
          ({
            item,
          }) => {
            if (
              category !==
                "ALL" &&
              item.quadrant !==
                category
            ) {
              return false;
            }

            if (
              !normalizedSearch
            ) {
              return true;
            }

            return item
              .label
              .toLocaleLowerCase(
                "pt-BR",
              )
              .includes(
                normalizedSearch,
              );
          },
        );
      },
      [
        indexedItems,
        search,
        category,
      ],
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredItems.length /
          PAGE_SIZE,
      ),
    );

  const safePage =
    Math.min(
      page,
      totalPages -
        1,
    );

  const visibleItems =
    filteredItems.slice(
      safePage *
        PAGE_SIZE,

      safePage *
        PAGE_SIZE +
        PAGE_SIZE,
    );

  /*
   * O descritivo pede um mínimo visual de 40 posições.
   *
   * Quando não houver 40 itens no recorte, completamos
   * a tabela com posições vazias.
   */
  const emptyRows =
    Math.max(
      0,
      PAGE_SIZE -
        visibleItems.length,
    );

  /*
   * Volta para a primeira página quando a busca, a categoria
   * ou os dados mudam. Ajuste feito durante a renderização
   * (padrão recomendado pelo React em vez de useEffect).
   */
  const [
    pageResetDeps,
    setPageResetDeps,
  ] =
    useState({
      search,
      category,
      items,
    });

  if (
    pageResetDeps.search !==
      search ||
    pageResetDeps.category !==
      category ||
    pageResetDeps.items !==
      items
  ) {
    setPageResetDeps({
      search,
      category,
      items,
    });

    setPage(
      0,
    );
  }

  const criticalChronicCount =
    items.filter(
      (
        item,
      ) =>
        item.quadrant ===
        "CRITICA_E_CRONICA",
    ).length;

  const highestDowntime =
    indexedItems[
      0
    ]?.item
      .downtimeMinutes ??
    0;

  const periodLabel =
    startDate ||
    endDate
      ? `${formatDate(
          startDate,
        )} — ${formatDate(
          endDate,
        )}`
      : "Período não informado";

  const itemLabel =
    analysisLevel ===
    "EQUIPMENT"
      ? "Equipamento"
      : "Falha";

  const categoryOptions:
    Array<{
      value:
        CategoryFilter;

      label:
        string;
    }> = [
      {
        value:
          "ALL",

        label:
          "Todas",
      },

      {
        value:
          "CRITICA_E_CRONICA",

        label:
          "Crítico-crônico",
      },

      {
        value:
          "CRITICA",

        label:
          "Crítico",
      },

      {
        value:
          "CRONICA",

        label:
          "Crônico",
      },

      {
        value:
          "BAIXA_RELEVANCIA",

        label:
          "Conforto",
      },
    ];

  return (
    <div className="border-t border-border-theme">
      {/* ===================================================
          CABEÇALHO
      ==================================================== */}

      <div className="px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Detalhamento técnico
            </p>

            <h3 className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-text-primary">
              Tabela do Jack-Knife
            </h3>

            <p className="mt-1 max-w-[680px] text-[11px] leading-5 text-text-secondary">
              Ranking por tempo total de parada, com frequência,
              MTTR e classificação de criticidade. A tabela mantém
              40 posições por página para facilitar a leitura e a
              comparação do recorte analisado.
            </p>
          </div>

          {/* ===============================================
              RESUMO
          ================================================ */}

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-border-theme bg-surface-hover xl:min-w-[420px]">
            <div className="bg-surface px-4 py-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-text-muted">
                Itens
              </p>

              <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-text-primary">
                {formatNumber(
                  items.length,
                )}
              </p>
            </div>

            <div className="bg-surface px-4 py-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-text-muted">
                Crítico-crônico
              </p>

              <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-accent-primary">
                {formatNumber(
                  criticalChronicCount,
                )}
              </p>
            </div>

            <div className="bg-surface px-4 py-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-text-muted">
                Maior parada
              </p>

              <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-text-primary">
                {formatNumber(
                  highestDowntime,
                  1,
                )}

                <span className="ml-1 text-[10px] font-medium tracking-normal text-text-muted">
                  min
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ===============================================
            CONTEXTO
        ================================================ */}

        <div className="mt-5 flex flex-wrap gap-2">
          <div className="rounded-full bg-surface-elevated px-3 py-1.5 text-[10px] text-text-body">
            Linha:{" "}

            <span className="font-semibold text-text-primary">
              {line?.trim() ||
                "Todas as linhas"}
            </span>
          </div>

          <div className="rounded-full bg-surface-elevated px-3 py-1.5 text-[10px] text-text-body">
            Período:{" "}

            <span className="font-semibold text-text-primary">
              {periodLabel}
            </span>
          </div>

          <div className="rounded-full bg-surface-elevated px-3 py-1.5 text-[10px] text-text-body">
            Visão:{" "}

            <span className="font-semibold text-text-primary">
              {analysisLevel ===
              "EQUIPMENT"
                ? "Máquinas"
                : "Falhas"}
            </span>
          </div>
        </div>

        {/* ===============================================
            BUSCA + CATEGORIAS
        ================================================ */}

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-[360px]">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />

            <input
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event
                    .target
                    .value,
                )
              }
              placeholder={
                `Buscar ${itemLabel.toLocaleLowerCase(
                  "pt-BR",
                )}...`
              }
              className="h-10 w-full rounded-[11px] border border-border-theme bg-surface pl-10 pr-10 text-[11px] text-text-primary outline-none transition focus:border-text-muted"
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch(
                    "",
                  )
                }
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated"
                aria-label="Limpar busca"
              >
                <X
                  size={13}
                />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {categoryOptions.map(
              (
                option,
              ) => (
                <button
                  key={
                    option.value
                  }
                  type="button"
                  onClick={() =>
                    setCategory(
                      option.value,
                    )
                  }
                  className={
                    `h-9 rounded-full border px-3.5 text-[10px] font-medium transition ${categoryButtonClasses(
                      category ===
                        option.value,
                    )}`
                  }
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          TABELA
      ==================================================== */}

      <div className="overflow-x-auto border-t border-border-theme">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-background-primary text-left">
              <th className="w-[72px] border-b border-border-theme px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Seq.
              </th>

              <th className="border-b border-border-theme px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                {itemLabel}
              </th>

              <th className="w-[150px] border-b border-border-theme px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                T(min)
              </th>

              <th className="w-[120px] border-b border-border-theme px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Q
              </th>

              <th className="w-[140px] border-b border-border-theme px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                MTTR
              </th>

              <th className="w-[190px] border-b border-border-theme px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Categoria
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleItems.map(
              (
                {
                  item,
                  originalIndex,
                },
                localIndex,
              ) => {
                const sequence =
                  safePage *
                    PAGE_SIZE +
                  localIndex +
                  1;

                return (
                  <tr
                    key={
                      `${item.label}-${originalIndex}`
                    }
                    onClick={() =>
                      onSelect?.(
                        item,
                        originalIndex,
                      )
                    }
                    className={
                      `border-b border-border-theme transition last:border-b-0 ${
                        onSelect
                          ? "cursor-pointer hover:bg-background-primary"
                          : ""
                      }`
                    }
                  >
                    <td className="px-5 py-3.5 text-[11px] font-semibold tabular-nums text-text-muted">
                      {String(
                        sequence,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <p className="max-w-[520px] text-[11px] font-medium leading-5 text-text-primary">
                        {item.label}
                      </p>
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] font-semibold tabular-nums text-text-primary">
                      {formatNumber(
                        item
                          .downtimeMinutes,
                        1,
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] font-semibold tabular-nums text-text-primary">
                      {formatNumber(
                        item
                          .frequency,
                        1,
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] font-semibold tabular-nums text-text-primary">
                      {formatNumber(
                        item.mttr,
                        1,
                      )}

                      <span className="ml-1 text-[9px] font-medium text-text-muted">
                        min
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={
                          `inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold ${quadrantClasses(
                            item
                              .quadrant,
                          )}`
                        }
                      >
                        {quadrantLabel(
                          item
                            .quadrant,
                        )}
                      </span>
                    </td>
                  </tr>
                );
              },
            )}

            {/* =============================================
                POSIÇÕES VAZIAS ATÉ 40
            ============================================== */}

            {Array.from({
              length:
                emptyRows,
            }).map(
              (
                _,
                index,
              ) => {
                const sequence =
                  safePage *
                    PAGE_SIZE +
                  visibleItems.length +
                  index +
                  1;

                return (
                  <tr
                    key={
                      `empty-${safePage}-${index}`
                    }
                    className="border-b border-border-theme last:border-b-0"
                  >
                    <td className="px-5 py-3.5 text-[11px] font-medium tabular-nums text-text-muted">
                      {String(
                        sequence,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-[11px] text-text-muted">
                      —
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] text-text-muted">
                      —
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] text-text-muted">
                      —
                    </td>

                    <td className="px-5 py-3.5 text-right text-[11px] text-text-muted">
                      —
                    </td>

                    <td className="px-5 py-3.5 text-[11px] text-text-muted">
                      —
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>

      {/* ===================================================
          PAGINAÇÃO
      ==================================================== */}

      <div className="flex flex-col gap-3 border-t border-border-theme px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="text-[10px] font-medium text-text-body">
            {filteredItems.length >
            0
              ? `Exibindo ${
                  safePage *
                    PAGE_SIZE +
                  1
                }–${Math.min(
                  (
                    safePage +
                    1
                  ) *
                    PAGE_SIZE,
                  filteredItems.length,
                )} de ${
                  filteredItems.length
                } itens`
              : "Nenhum item corresponde aos filtros da tabela"}
          </p>

          <p className="mt-0.5 text-[9px] text-text-muted">
            Ordenação principal: maior tempo total de parada para o menor.
          </p>
        </div>

        {totalPages >
          1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPage(
                  (
                    current,
                  ) =>
                    Math.max(
                      0,
                      current -
                        1,
                    ),
                )
              }
              disabled={
                safePage ===
                0
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-theme bg-surface px-3 text-[10px] font-medium text-text-body transition hover:bg-background-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft
                size={13}
              />

              Anterior
            </button>

            <span className="min-w-[58px] text-center text-[10px] font-semibold text-text-body">
              {safePage +
                1}
              {" / "}
              {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage(
                  (
                    current,
                  ) =>
                    Math.min(
                      totalPages -
                        1,
                      current +
                        1,
                    ),
                )
              }
              disabled={
                safePage >=
                totalPages -
                  1
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border-theme bg-surface px-3 text-[10px] font-medium text-text-body transition hover:bg-background-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              Próximo

              <ChevronRight
                size={13}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}