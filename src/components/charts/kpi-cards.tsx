"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";

import {
  formatChange,
  formatInteger,
  formatMinutes,
} from "@/lib/analytics/format";

import type {
  KpiCardData,
} from "@/lib/analytics/aggregations/kpis";

/* =========================================================
   G11 - CARTÕES DE KPI
========================================================= */

function formatValue(
  card: KpiCardData,
): string {
  if (card.text !== null) {
    return card.text;
  }

  if (card.value === null) {
    return "—";
  }

  if (card.key === "OCCURRENCES") {
    return formatInteger(card.value);
  }

  return formatMinutes(card.value);
}

function ChangeBadge({
  card,
}: {
  card: KpiCardData;
}) {
  const label = formatChange(
    card.changePercentage,
  );

  if (
    label === null ||
    card.changePercentage === null
  ) {
    return (
      <span className="text-[11px] text-text-secondary">
        sem período anterior
      </span>
    );
  }

  const value = card.changePercentage;

  /*
    Nestes KPIs cair é bom. A seta indica a direção e a cor
    indica se o movimento foi favorável — nunca só a cor.
  */
  const isNeutral = value === 0;

  const isGood = card.lowerIsBetter
    ? value < 0
    : value > 0;

  const Icon = isNeutral
    ? Minus
    : value > 0
      ? ArrowUpRight
      : ArrowDownRight;

  const tone = isNeutral
    ? "text-text-secondary"
    : isGood
      ? "text-chart-good"
      : "text-chart-bad";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}
      title="Comparado ao período anterior de mesmo tamanho"
    >
      <Icon size={13} strokeWidth={2.2} />
      {label}
    </span>
  );
}

export function KpiCards({
  cards,
}: {
  cards: KpiCardData[];
}) {
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.key}
          className="min-w-0 rounded-[18px] border border-border-theme bg-surface p-5 transition-colors"
        >
          <p className="text-[11px] font-medium leading-4 text-text-secondary">
            {card.label}
          </p>

          <p
            className="mt-3 truncate text-[22px] font-semibold tracking-[-0.03em] text-text-primary"
            title={formatValue(card)}
          >
            {formatValue(card)}
          </p>

          {card.detail && (
            <p className="mt-1 truncate text-[11px] text-text-secondary">
              {card.detail}
            </p>
          )}

          <div className="mt-3">
            <ChangeBadge card={card} />
          </div>
        </div>
      ))}
    </section>
  );
}
