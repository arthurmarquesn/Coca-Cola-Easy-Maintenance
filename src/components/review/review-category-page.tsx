"use client";

import Image from "next/image";
import Link from "next/link";

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
    <main className="min-h-screen bg-white">
      <header className="border-b border-[#E8E9EB] bg-white">
        <div className="mx-auto flex h-[78px] w-full max-w-[1440px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link href="/dashboard">
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={70}
              priority
              className="h-auto max-h-[52px] w-auto max-w-[140px] object-contain"
            />
          </Link>

          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-[#2D3034]">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[11px] text-[#979BA1]">
                {unit.city}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1440px] px-6 pb-28 pt-12 sm:px-8 lg:px-12 lg:pt-16">
        <Link
          href="/dashboard/revisao"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voltar para validação
        </Link>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.04em] text-[#191B1E] sm:text-[34px]">
              {categoryLabel}
            </h1>

            <p className="mt-2 text-[13px] text-[#7D8288]">
              {summary.total} ocorrência(s) · {summary.pending} pendente(s) ·
              {" "}
              {progress}% já validado
            </p>
          </div>

          <div className="h-[5px] w-full max-w-[220px] overflow-hidden rounded-full bg-[#ECEEEF]">
            <div
              className="h-full rounded-full bg-[#238636] transition-all duration-300"
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
          <label className="flex items-center gap-2 text-[12px] font-medium text-[#4A4F55]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 accent-[#F40009]"
            />
            Selecionar todas nesta página ({items.length})
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#9A9EA3]">Ordenar por:</span>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortValue)}
              className="h-8 rounded-[8px] border border-[#DEE1E5] bg-white px-2 text-[11.5px] text-[#4A4F55] outline-none focus:border-[#F40009]"
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
          <div className="sticky top-3 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#F40009] bg-[#FFF6F6] px-4 py-3">
            <span className="text-[12.5px] font-semibold text-[#8A2A2E]">
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
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#DEE1E5] bg-white px-3.5 py-2 text-[11.5px] font-semibold text-[#4A4F55] transition-colors hover:bg-[#F5F5F5] disabled:opacity-50"
              >
                <Pencil size={13} />
                Reclassificar selecionadas
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkAction("REJECT")}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#DEE1E5] bg-white px-3.5 py-2 text-[11.5px] font-semibold text-[#C92A32] transition-colors hover:bg-[#FFF6F6] disabled:opacity-50"
              >
                <X size={13} />
                Rejeitar selecionadas
              </button>

              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] font-medium text-[#8A8E94] hover:text-[#4A4F55]"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        )}

        {bulkCorrectOpen && (
          <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-[#DEE1E5] bg-[#FAFAFA] p-4 sm:flex-row sm:items-center">
            <input
              type="text"
              autoFocus
              value={bulkCorrectComponent}
              onChange={(event) => setBulkCorrectComponent(event.target.value)}
              placeholder="Componente correto (ex.: rolamento do motor)"
              className="h-10 w-full flex-1 rounded-[8px] border border-[#DEE1E5] bg-white px-3 text-[12.5px] outline-none focus:border-[#F40009]"
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
                className="rounded-[8px] border border-[#DEE1E5] px-3.5 py-2 text-[11.5px] font-medium text-[#4A4F55] hover:bg-[#F0F0F0]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-[#F0D2D4] bg-[#FFF9F9] px-4 py-3">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-[#C92A32]"
            />
            <p className="text-[12px] leading-5 text-[#6F3D40]">{error}</p>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-[14px] border border-[#E9EBEE]">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E9EBEE] bg-[#FAFAFA] text-[10.5px] font-semibold uppercase tracking-wide text-[#8A8E94]">
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
                    <tr className="border-b border-[#F0F1F2] align-top transition-colors hover:bg-[#FAFAFA]">
                      <td className="px-3 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(item.suggestionId)}
                          onChange={() => toggleSelect(item.suggestionId)}
                          className="h-4 w-4 accent-[#F40009]"
                        />
                      </td>

                      <td className="px-3 py-3.5 text-[#4A4F55]">
                        <p className="font-medium">
                          {formatDate(item.event.date)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#9A9EA3]">
                          {item.event.shift ?? "—"}
                        </p>
                      </td>

                      <td className="px-3 py-3.5 text-[#4A4F55]">
                        <p className="font-medium">
                          {item.event.line ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#9A9EA3]">
                          {item.event.equipment ?? "—"}
                        </p>
                      </td>

                      <td className="max-w-[260px] px-3 py-3.5 text-[#4A4F55]">
                        <p className="line-clamp-3">
                          {item.event.observation || "—"}
                        </p>
                      </td>

                      <td className="max-w-[200px] px-3 py-3.5">
                        <p className="font-medium text-[#292C30]">
                          {item.suggestion.failureMode}
                        </p>

                        {item.reviewedByName && (
                          <p className="mt-0.5 text-[11px] text-[#9A9EA3]">
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
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DEE1E5] text-[#238636] transition-colors hover:bg-[#F0F9F1] disabled:opacity-40"
                            >
                              <Check size={14} />
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              title="Corrigir"
                              onClick={() => startEditing(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DEE1E5] text-[#2E5AAC] transition-colors hover:bg-[#EEF3FF] disabled:opacity-40"
                            >
                              <Pencil size={14} />
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              title="Rejeitar"
                              onClick={() => handleReject(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DEE1E5] text-[#C92A32] transition-colors hover:bg-[#FFF6F6] disabled:opacity-40"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-[11px] text-[#B3B6BB]">
                            revisada
                          </p>
                        )}
                      </td>
                    </tr>

                    {isEditing && (
                      <tr className="border-b border-[#F0F1F2] bg-[#FAFBFF]">
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
                              className="h-10 w-full flex-1 rounded-[8px] border border-[#DEE1E5] bg-white px-3 text-[12.5px] outline-none focus:border-[#F40009]"
                            />

                            <input
                              type="text"
                              value={editNote}
                              onChange={(event) =>
                                setEditNote(event.target.value)
                              }
                              placeholder="Observação (opcional)"
                              className="h-10 w-full flex-1 rounded-[8px] border border-[#DEE1E5] bg-white px-3 text-[12.5px] outline-none focus:border-[#F40009]"
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
                                className="rounded-[8px] border border-[#DEE1E5] px-3.5 py-2 text-[11.5px] font-medium text-[#4A4F55] hover:bg-[#F0F0F0]"
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
                    className="px-4 py-14 text-center text-[13px] text-[#9A9EA3]"
                  >
                    Nenhuma ocorrência encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <div className="flex items-center justify-center gap-3 border-t border-[#F0F1F2] py-8 text-[13px] text-[#777C82]">
              <LoaderCircle size={17} className="animate-spin text-[#F40009]" />
              Carregando ocorrências...
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between text-[12px] text-[#7D8288]">
            <span>
              Página {page} de {totalPages} · {total} ocorrência(s)
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DEE1E5] text-[#4A4F55] disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DEE1E5] text-[#4A4F55] disabled:opacity-40"
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
