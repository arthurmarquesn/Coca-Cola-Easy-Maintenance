"use client";

import {
  MASP_CATEGORIES,
  type MaspCategory,
} from "@/lib/masp/domain";


interface Hypothesis {
  id: number;
  category: MaspCategory;
  description: string;
  status: string;
  source: string;
  support_count: number;
}

const LABELS:
Record<MaspCategory, string> = {
  MAQUINA:
    "Máquina",
  METODO:
    "Método",
  MAO_DE_OBRA:
    "Mão de obra",
  MATERIAL:
    "Material",
  MEDICAO:
    "Medição",
  MEIO_AMBIENTE:
    "Meio ambiente",
};

export function IshikawaBoard({
  problem,
  hypotheses,
  onSelect,
}: {
  problem: string;
  hypotheses: Hypothesis[];
  onSelect?: (
    hypothesis: Hypothesis,
  ) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#E3E5E7] bg-[#FCFCFB] p-5 sm:p-7">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="pointer-events-none absolute left-4 right-0 top-1/2 hidden h-px bg-[#D9DCDF] lg:block" />

          {MASP_CATEGORIES.map(
            (
              category,
            ) => {
              const items =
                hypotheses.filter(
                  (
                    item,
                  ) =>
                    item.category ===
                      category &&
                    item.status !==
                      "DISCARDED",
                );

              return (
                <section
                  key={
                    category
                  }
                  className="relative z-10 min-h-[150px] rounded-[16px] border border-[#E2E4E6] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#454A50]">
                      {LABELS[category]}
                    </h3>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F2F2F0] px-2 text-[9px] font-semibold text-[#7A7F85]">
                      {items.length}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {items.map(
                      (
                        item,
                      ) => (
                        <button
                          key={
                            item.id
                          }
                          type="button"
                          onClick={() =>
                            onSelect?.(
                              item,
                            )
                          }
                          className="w-full rounded-[10px] border-l-2 border-[#E41E2B] bg-[#FAFAF9] px-3 py-2 text-left hover:bg-[#FFF4F5]"
                        >
                          <span className="block text-[10px] font-medium leading-4 text-[#4B5056]">
                            {item.description}
                          </span>
                          <span className="mt-1 block text-[8px] uppercase tracking-[0.06em] text-[#9A9FA5]">
                            {item.source ===
                              "HISTORY"
                              ? "Histórico local"
                              : item.source ===
                                  "RULE"
                                ? "Regra local"
                                : "Analista"}
                          </span>
                        </button>
                      ),
                    )}

                    {items.length ===
                      0 && (
                      <p className="py-5 text-center text-[9px] text-[#A0A4A9]">
                        Sem hipóteses
                      </p>
                    )}
                  </div>
                </section>
              );
            },
          )}
        </div>

        <aside className="relative rounded-[18px] bg-[#E41E2B] p-5 text-white lg:before:absolute lg:before:right-full lg:before:top-1/2 lg:before:h-px lg:before:w-6 lg:before:bg-[#D9DCDF]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/65">
            Efeito observado
          </p>
          <p className="mt-3 text-[13px] font-semibold leading-6">
            {problem}
          </p>
        </aside>
      </div>
    </div>
  );
}

