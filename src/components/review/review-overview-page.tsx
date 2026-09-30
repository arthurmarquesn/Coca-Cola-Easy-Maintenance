"use client";

import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import {
  AlertCircle,
  ArrowLeft,
  LoaderCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CategoryCard } from "./category-card";
import { ReviewFiltersBar } from "./review-filters-bar";

import {
  buildFilterSearchParams,
  DEFAULT_REVIEW_FILTERS,
  type CategorySummary,
  type ReviewFilterOptions,
  type ReviewFiltersState,
} from "./types";

interface ReviewOverviewPageProps {
  user: { name: string };
  unit: { city: string | null };
}

interface CategoriesResponse {
  success: boolean;
  error?: string;
  categories?: CategorySummary[];
  totals?: {
    total: number;
    pending: number;
    validated: number;
    lowConfidencePending: number;
  };
}

interface FiltersResponse {
  success: boolean;
  lines?: ReviewFilterOptions["lines"];
  equipments?: ReviewFilterOptions["equipments"];
  shifts?: ReviewFilterOptions["shifts"];
}

type CategorySort = "pending" | "total" | "confidence";

const SORT_OPTIONS: { value: CategorySort; label: string }[] = [
  { value: "pending", label: "Mais pendências" },
  { value: "total", label: "Maior número de ocorrências" },
  { value: "confidence", label: "Menor confiança primeiro" },
];

export function ReviewOverviewPage({ user, unit }: ReviewOverviewPageProps) {
  const [filters, setFilters] = useState<ReviewFiltersState>(
    DEFAULT_REVIEW_FILTERS,
  );

  const [filterOptions, setFilterOptions] = useState<ReviewFilterOptions>({
    lines: [],
    equipments: [],
    shifts: [],
  });

  const [categories, setCategories] = useState<CategorySummary[]>([]);

  const [totals, setTotals] = useState({
    total: 0,
    pending: 0,
    validated: 0,
    lowConfidencePending: 0,
  });

  const [sort, setSort] = useState<CategorySort>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        /* opções de filtro são um extra; falha aqui não bloqueia a tela */
      }
    }

    void loadFilters();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadCategories = useCallback(
    async (currentFilters: ReviewFiltersState) => {
      setLoading(true);

      try {
        const params = buildFilterSearchParams(currentFilters);

        const response = await fetch(
          `/api/review/categories?${params.toString()}`,
          { cache: "no-store" },
        );

        const data = (await response.json()) as CategoriesResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ?? "Não foi possível carregar as categorias.",
          );
        }

        setCategories(data.categories ?? []);

        if (data.totals) {
          setTotals(data.totals);
        }

        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as categorias.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCategories(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters, loadCategories]);

  const sortedCategories = useMemo(() => {
    const list = [...categories];

    if (sort === "total") {
      list.sort((a, b) => b.total - a.total);
    } else if (sort === "confidence") {
      list.sort((a, b) => {
        const left = a.averageConfidence ?? 1;
        const right = b.averageConfidence ?? 1;

        return left - right;
      });
    } else {
      list.sort((a, b) => b.pending - a.pending);
    }

    return list;
  }, [categories, sort]);

  return (
    <main className="min-h-screen bg-background-primary transition-colors">
      <header className="border-b border-border-theme transition-colors bg-background-primary transition-colors">
        <div className="mx-auto flex h-[78px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">
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

          <div className="flex items-center gap-5">
            <ThemeSwitcher />
            <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-text-primary">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {unit.city}
              </p>
            )}
          </div>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-24 pt-12 sm:px-8 lg:px-12 lg:pt-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Voltar
        </Link>

        <div className="mt-10">
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em] text-text-primary sm:text-[40px]">
            Validação humana
          </h1>

          <p className="mt-3 max-w-[680px] text-[14px] leading-7 text-text-secondary">
            Revise as classificações sugeridas pela IA agrupadas por tipo de
            problema. Apenas classificações revisadas por uma pessoa são
            registradas como oficiais.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[14px] border border-[#E9EBEE] bg-background-primary transition-colors px-4 py-3.5">
            <p className="text-[11px] font-medium text-[#7C8087]">Total</p>
            <p className="mt-1 text-[22px] font-semibold text-[#191919]">
              {totals.total}
            </p>
          </div>

          <div className="rounded-[14px] border border-[#F8C6C8] bg-background-primary transition-colors px-4 py-3.5">
            <p className="text-[11px] font-medium text-[#7C8087]">
              Pendentes
            </p>
            <p className="mt-1 text-[22px] font-semibold text-[#F40009]">
              {totals.pending}
            </p>
          </div>

          <div className="rounded-[14px] border border-[#E9EBEE] bg-background-primary transition-colors px-4 py-3.5">
            <p className="text-[11px] font-medium text-[#7C8087]">
              Validadas
            </p>
            <p className="mt-1 text-[22px] font-semibold text-[#238636]">
              {totals.validated}
            </p>
          </div>

          <div className="rounded-[14px] border border-[#E9EBEE] bg-background-primary transition-colors px-4 py-3.5">
            <p className="text-[11px] font-medium text-[#7C8087]">
              Baixa confiança
            </p>
            <p className="mt-1 text-[22px] font-semibold text-[#B8860B]">
              {totals.lowConfidencePending}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ReviewFiltersBar
            filters={filters}
            onChange={setFilters}
            options={filterOptions}
          />
        </div>

        <div className="mt-7 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#4A4F55]">
            Categorias de problema
          </h2>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#9A9EA3]">Ordenar por:</span>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as CategorySort)}
              className="h-8 rounded-[8px] border border-[#DEE1E5] bg-background-primary transition-colors px-2 text-[11.5px] text-[#4A4F55] outline-none focus:border-[#F40009]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-[#F0D2D4] bg-[#FFF9F9] px-4 py-3">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-[#C92A32]"
            />
            <p className="text-[12px] leading-5 text-[#6F3D40]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mt-10 flex items-center gap-3 text-[13px] text-[#777C82]">
            <LoaderCircle size={18} className="animate-spin text-[#F40009]" />
            Carregando categorias...
          </div>
        ) : sortedCategories.length === 0 ? (
          <div className="mt-10 rounded-[18px] border border-[#E4E6E8] px-7 py-14 text-center">
            <h3 className="text-[16px] font-semibold text-[#292C30]">
              Nenhuma ocorrência encontrada
            </h3>

            <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[#858A90]">
              Ajuste os filtros ou aguarde novas sugestões geradas pelo
              modelo de IA.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedCategories.map((category) => (
              <CategoryCard
                key={category.slug}
                category={category}
                href={`/dashboard/revisao/${category.slug}?${buildFilterSearchParams(filters).toString()}`}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
