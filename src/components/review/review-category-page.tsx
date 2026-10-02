"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  X,
} from "lucide-react";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ReviewFiltersBar } from "./review-filters-bar";
import { ConfidenceBadge, StatusBadge } from "./status-badge";

import {
  buildFilterSearchParams,
  DEFAULT_REVIEW_FILTERS,
  type ReviewFilterOptions,
  type ReviewFiltersState,
  type ReviewItem,
  type ReviewSummary,
} from "./types";

interface ReviewCategoryPageProps {
  user: { name: string };
  unit: { city: string | null };
  categorySlug: string;
  categoryLabel: string;
  initialFilters?: Partial<ReviewFiltersState>;
}

interface ItemsResponse {
  success: boolean;
  error?: string;
  items?: ReviewItem[];
  summary?: ReviewSummary;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

interface FiltersResponse {
  success: boolean;
  lines?: ReviewFilterOptions["lines"];
  equipments?: ReviewFilterOptions["equipments"];
  shifts?: ReviewFilterOptions["shifts"];
}

interface BulkResponse {
  success: boolean;
  error?: string;
  message?: string;
  accepted?: number;
  failed?: { suggestionId: number; error: string }[];
}

type SortValue = "confidence_asc" | "confidence_desc" | "date_desc" | "date_asc";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "confidence_asc", label: "Menor confiança primeiro" },
  { value: "confidence_desc", label: "Maior confiança primeiro" },
  { value: "date_desc", label: "Mais recentes" },
  { value: "date_asc", label: "Mais antigas" },
];

const PAGE_SIZE = 25;

function formatDate(value: string | null): string {
  if (!value) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function suggestedComponentName(item: ReviewItem): string {
  const fromMode = item.suggestion.failureMode
    ?.replace(/^Falha\s+de\s+/i, "")
    .trim();

  if (fromMode) return fromMode;

  return item.suggestion.failedComponentCode
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ReviewCategoryPage({
  user,
  unit,
  categorySlug,
  categoryLabel,
  initialFilters,
}: ReviewCategoryPageProps) {
  const [filters, setFilters] = useState<ReviewFiltersState>({
    ...DEFAULT_REVIEW_FILTERS,
    status: "PENDENTE_REVISAO",
    ...initialFilters,
  });

  const [filterOptions, setFilterOptions] = useState<ReviewFilterOptions>({
    lines: [],
    equipments: [],
    shifts: [],
  });

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({
    total: 0,
    pending: 0,
    confirmed: 0,
    corrected: 0,
    rejected: 0,
    reviewed: 0,
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortValue>("confidence_asc");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComponent, setEditComponent] = useState("");
  const [editNote, setEditNote] = useState("");

  const [bulkCorrectOpen, setBulkCorrectOpen] = useState(false);
  const [bulkCorrectComponent, setBulkCorrectComponent] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        const response = await fetch("/api/review/filters", {
          cache: "no-store",
        });

        const data = (await response.json()) as FiltersResponse;

        if (!cancelled && data.success) {
          setFilterOptions({
            lines: data.lines ?? [],
            equipments: data.equipments ?? [],
            shifts: data.shifts ?? [],
          });
        }
      } catch {
        /* opcional */
      }
    }

    void loadFilters();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadItems = useCallback(
    async (
      currentFilters: ReviewFiltersState,
      currentPage: number,
      currentSort: SortValue,
    ) => {
      setLoading(true);

      try {
        const params = buildFilterSearchParams(currentFilters, {
          category: categorySlug,
          page: currentPage,
          pageSize: PAGE_SIZE,
          sort: currentSort,
        });

        const response = await fetch(`/api/review?${params.toString()}`, {
          cache: "no-store",
        });

        const data = (await response.json()) as ItemsResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ?? "Não foi possível carregar as ocorrências.",
          );
        }

        setItems(data.items ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
        setPage(data.page ?? 1);

        if (data.summary) setSummary(data.summary);

        setSelected(new Set());
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as ocorrências.",
        );
      } finally {
        setLoading(false);
      }
    },
    [categorySlug],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadItems(filters, 1, sort);
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, categorySlug]);

  function goToPage(nextPage: number) {
    void loadItems(filters, nextPage, sort);
  }

  const allSelected =
    items.length > 0 && items.every((item) => selected.has(item.suggestionId));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((item) => item.suggestionId)));
    }
  }

  function toggleSelect(suggestionId: number) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }

      return next;
    });
  }

  function updateItemLocally(
    suggestionId: number,
    status: ReviewItem["status"],
    extra?: Partial<ReviewItem["suggestion"]>,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.suggestionId === suggestionId
          ? {
              ...item,
              status,
              suggestion: { ...item.suggestion, ...extra },
            }
          : item,
      ),
    );
  }

  async function reviewOne(
    suggestionId: number,
    action: "CONFIRM" | "CORRECT" | "REJECT",
    payload?: { correctedComponent?: string; note?: string },
  ) {
    setBusyIds((current) => new Set(current).add(suggestionId));

    try {
      const response = await fetch("/api/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          action,
          correctedComponent: payload?.correctedComponent,
          note: payload?.note,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        classification?: { failedComponentCode: string; failureMode: string };
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Não foi possível registrar a revisão.");
      }

      const nextStatus =
        action === "CONFIRM"
          ? "CONFIRMADA"
          : action === "CORRECT"
            ? "CORRIGIDA"
            : "DESCARTADA";

      updateItemLocally(
        suggestionId,
        nextStatus,
        data.classification
          ? {
              failedComponentCode: data.classification.failedComponentCode,
              failureMode: data.classification.failureMode,
            }
          : undefined,
      );

      setSummary((current) => ({
        ...current,
        pending: Math.max(current.pending - 1, 0),
        reviewed: current.reviewed + 1,
        confirmed:
          action === "CONFIRM" ? current.confirmed + 1 : current.confirmed,
        corrected:
          action === "CORRECT" ? current.corrected + 1 : current.corrected,
        rejected:
          action === "REJECT" ? current.rejected + 1 : current.rejected,
      }));

      setEditingId(null);
      setError("");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Não foi possível registrar a revisão.",
      );
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(suggestionId);
        return next;
      });
    }
  }

  function startEditing(item: ReviewItem) {
    setEditingId(item.suggestionId);
    setEditComponent(suggestedComponentName(item));
    setEditNote("");
  }

  function handleReject(item: ReviewItem) {
    const confirmed = window.confirm(
      `Rejeitar a sugestão da IA para esta ocorrência? O evento ficará sem classificação oficial até ser revisado manualmente.`,
    );

    if (!confirmed) return;

    void reviewOne(item.suggestionId, "REJECT");
  }

  async function runBulkAction(
    action: "CONFIRM" | "CORRECT" | "REJECT",
    correctedComponent?: string,
  ) {
    if (selected.size === 0) return;

    if (
      action === "REJECT" &&
      !window.confirm(
        `Rejeitar ${selected.size} sugestão(ões) selecionada(s)?`,
      )
    ) {
      return;
    }

    setBulkBusy(true);

    try {
      const response = await fetch("/api/review/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionIds: Array.from(selected),
          action,
          correctedComponent,
        }),
      });

      const data = (await response.json()) as BulkResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Não foi possível concluir a ação.");
      }

      if (data.failed && data.failed.length > 0) {
        setError(
          `${data.failed.length} ocorrência(s) não puderam ser atualizadas (provavelmente já revisadas).`,
        );
      } else {
        setError("");
      }

      setBulkCorrectOpen(false);
      setBulkCorrectComponent("");

      await loadItems(filters, page, sort);
    } catch (bulkError) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : "Não foi possível concluir a ação em lote.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  const progress = useMemo(
    () =>
      summary.total > 0
        ? Math.round((summary.reviewed / summary.total) * 100)
        : 0,
    [summary],
  );

  return (
    <main className="min-h-screen bg-surface-elevated transition-colors">
      <AppHeader userName={user.name} city={unit.city} />

      <section className="mx-auto w-full max-w-[1440px] px-6 pb-28 pt-12 sm:px-8 lg:px-12 lg:pt-16">
        <Link
          href="/dashboard/revisao"
          className="inline-flex items-center gap-2 rounded-[10px] border border-[#F40009] bg-[#F40009] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-[#B90007] hover:bg-[#B90007]"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voltar para validação
        </Link>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-text-title">
              {categoryLabel}
            </h1>

            <p className="mt-4 text-[14px] leading-6 text-text-body">
              {summary.total} ocorrência(s) · {summary.pending} pendente(s) ·
              {" "}
              {progress}% já validado
            </p>
          </div>

          <div className="h-[5px] w-full max-w-[220px] overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-7">
          <ReviewFiltersBar
            filters={filters}
            onChange={setFilters}
            options={filterOptions}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 accent-[#F40009]"
            />
            Selecionar todas nesta página ({items.length})
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-secondary">Ordenar por:</span>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortValue)}
              className="h-8 rounded-[8px] border border-border-theme bg-surface transition-colors px-2 text-[11.5px] text-text-primary outline-none focus:border-[#F40009]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="sticky top-3 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#F40009] bg-surface-elevated px-4 py-3">
            <span className="text-[12.5px] font-semibold text-text-primary">
              {selected.size} selecionada(s)
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkAction("CONFIRM")}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#238636] px-3.5 py-2 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={13} />
                Aprovar selecionadas
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkCorrectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-theme bg-surface transition-colors px-3.5 py-2 text-[11.5px] font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <Pencil size={13} />
                Reclassificar selecionadas
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkAction("REJECT")}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-theme bg-surface transition-colors px-3.5 py-2 text-[11.5px] font-semibold text-error transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <X size={13} />
                Rejeitar selecionadas
              </button>

              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] font-medium text-text-secondary hover:text-text-primary"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        )}

        {bulkCorrectOpen && (
          <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-border-theme bg-surface-elevated transition-colors p-4 sm:flex-row sm:items-center">
            <input
              type="text"
              autoFocus
              value={bulkCorrectComponent}
              onChange={(event) => setBulkCorrectComponent(event.target.value)}
              placeholder="Componente correto (ex.: rolamento do motor)"
              className="h-10 w-full flex-1 rounded-[8px] border border-border-theme bg-surface transition-colors px-3 text-[12.5px] outline-none focus:border-[#F40009]"
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={bulkBusy || bulkCorrectComponent.trim().length < 2}
                onClick={() =>
                  void runBulkAction("CORRECT", bulkCorrectComponent)
                }
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#2E5AAC] px-3.5 py-2 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {bulkBusy && <LoaderCircle size={13} className="animate-spin" />}
                Aplicar a todas selecionadas
              </button>

              <button
                type="button"
                onClick={() => setBulkCorrectOpen(false)}
                className="rounded-[8px] border border-border-theme px-3.5 py-2 text-[11.5px] font-medium text-text-primary hover:bg-surface-hover"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-error/25 bg-error/10 px-4 py-3">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-error"
            />
            <p className="text-[12px] leading-5 text-error">{error}</p>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-[14px] border border-border-theme bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border-theme bg-surface-elevated transition-colors text-[10.5px] font-semibold uppercase tracking-wide text-text-secondary">
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3">Data / Turno</th>
                <th className="px-3 py-3">Linha / Equipamento</th>
                <th className="px-3 py-3">Descrição do operador</th>
                <th className="px-3 py-3">Sugestão da IA</th>
                <th className="px-3 py-3">Confiança</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const busy = busyIds.has(item.suggestionId);
                const isEditing = editingId === item.suggestionId;

                return (
                  <Fragment key={item.suggestionId}>
                    <tr className="border-b border-border-theme align-top outline outline-1 -outline-offset-1 outline-transparent transition-colors hover:outline-text-primary">
                      <td className="px-3 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(item.suggestionId)}
                          onChange={() => toggleSelect(item.suggestionId)}
                          className="h-4 w-4 accent-[#F40009]"
                        />
                      </td>

                      <td className="px-3 py-3.5 text-text-primary">
                        <p className="font-medium">
                          {formatDate(item.event.date)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-secondary">
                          {item.event.shift ?? "—"}
                        </p>
                      </td>

                      <td className="px-3 py-3.5 text-text-primary">
                        <p className="font-medium">
                          {item.event.line ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-secondary">
                          {item.event.equipment ?? "—"}
                        </p>
                      </td>

                      <td className="max-w-[260px] px-3 py-3.5 text-text-primary">
                        <p className="line-clamp-3">
                          {item.event.observation || "—"}
                        </p>
                      </td>

                      <td className="max-w-[200px] px-3 py-3.5">
                        <p className="font-medium text-text-primary">
                          {item.suggestion.failureMode}
                        </p>

                        {item.reviewedByName && (
                          <p className="mt-0.5 text-[11px] text-text-secondary">
                            revisado por {item.reviewedByName}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        <ConfidenceBadge value={item.suggestion.confidence} />
                      </td>

                      <td className="px-3 py-3.5">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-3 py-3.5">
                        {item.status === "PENDENTE_REVISAO" ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              title="Aprovar"
                              onClick={() =>
                                void reviewOne(item.suggestionId, "CONFIRM")
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-success transition-colors hover:bg-surface-hover disabled:opacity-40"
                            >
                              <Check size={14} />
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              title="Corrigir"
                              onClick={() => startEditing(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-chart-neutral transition-colors hover:bg-surface-hover disabled:opacity-40"
                            >
                              <Pencil size={14} />
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              title="Rejeitar"
                              onClick={() => handleReject(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-error transition-colors hover:bg-surface-hover disabled:opacity-40"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-[11px] text-text-secondary">
                            revisada
                          </p>
                        )}
                      </td>
                    </tr>

                    {isEditing && (
                      <tr className="border-b border-border-theme bg-surface-elevated">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              autoFocus
                              value={editComponent}
                              onChange={(event) =>
                                setEditComponent(event.target.value)
                              }
                              placeholder="Componente correto"
                              className="h-10 w-full flex-1 rounded-[8px] border border-border-theme bg-surface transition-colors px-3 text-[12.5px] outline-none focus:border-[#F40009]"
                            />

                            <input
                              type="text"
                              value={editNote}
                              onChange={(event) =>
                                setEditNote(event.target.value)
                              }
                              placeholder="Observação (opcional)"
                              className="h-10 w-full flex-1 rounded-[8px] border border-border-theme bg-surface transition-colors px-3 text-[12.5px] outline-none focus:border-[#F40009]"
                            />

                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                disabled={busy || editComponent.trim().length < 2}
                                onClick={() =>
                                  void reviewOne(
                                    item.suggestionId,
                                    "CORRECT",
                                    {
                                      correctedComponent: editComponent,
                                      note: editNote,
                                    },
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#2E5AAC] px-3.5 py-2 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {busy && (
                                  <LoaderCircle
                                    size={13}
                                    className="animate-spin"
                                  />
                                )}
                                Salvar correção
                              </button>

                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-[8px] border border-border-theme px-3.5 py-2 text-[11.5px] font-medium text-text-primary hover:bg-surface-hover"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-14 text-center text-[13px] text-text-secondary"
                  >
                    Nenhuma ocorrência encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <div className="flex items-center justify-center gap-3 border-t border-border-theme py-8 text-[13px] text-text-secondary">
              <LoaderCircle size={17} className="animate-spin text-[#F40009]" />
              Carregando ocorrências...
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between text-[12px] text-text-secondary">
            <span>
              Página {page} de {totalPages} · {total} ocorrência(s)
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-text-primary disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-text-primary disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
