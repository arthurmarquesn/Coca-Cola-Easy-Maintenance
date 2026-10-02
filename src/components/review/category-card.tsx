"use client";

import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import type { CategorySummary } from "./types";

interface CategoryCardProps {
  category: CategorySummary;
  href: string;
}

function confidenceColor(value: number | null): string {
  if (value === null) return "var(--text-muted)";
  if (value >= 0.85) return "var(--success)";
  if (value >= 0.7) return "var(--warning)";
  return "var(--error)";
}

export function CategoryCard({ category, href }: CategoryCardProps) {
  const hasLowConfidence = category.lowConfidencePending > 0;

  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-[18px] border border-border-theme bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-theme hover:shadow-[0_12px_30px_rgba(0,0,0,0.05)]"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-text-title">
            {category.label}
          </h3>

          {hasLowConfidence && (
            <span
              title={`${category.lowConfidencePending} pendente(s) com baixa confiança`}
              className="flex shrink-0 items-center gap-1 rounded-full bg-error/10 px-2 py-1 text-[10px] font-semibold text-error"
            >
              <AlertTriangle size={11} strokeWidth={2.2} />
              {category.lowConfidencePending}
            </span>
          )}
        </div>

        <p className="mt-3 text-[26px] font-semibold tracking-[-0.02em] text-text-title">
          {category.total}
          <span className="ml-1.5 text-[12px] font-medium text-text-secondary">
            ocorrência(s)
          </span>
        </p>

        <div className="mt-3 flex items-center gap-4 text-[11.5px] text-text-secondary">
          <span>
            <strong className="font-semibold text-success">
              {category.validated}
            </strong>{" "}
            validada(s)
          </span>

          <span>
            <strong className="font-semibold text-error">
              {category.pending}
            </strong>{" "}
            pendente(s)
          </span>
        </div>

        <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: `${Math.min(category.percentValidated, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-theme pt-4">
        <span
          className="text-[11.5px] font-semibold"
          style={{ color: confidenceColor(category.averageConfidence) }}
        >
          Confiança média:{" "}
          {category.averageConfidence === null
            ? "—"
            : `${Math.round(category.averageConfidence * 100)}%`}
        </span>

        <ArrowRight
          size={16}
          className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#F40009]"
        />
      </div>
    </Link>
  );
}
