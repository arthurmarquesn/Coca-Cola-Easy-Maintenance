"use client";

import {
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { useState } from "react";

import {
  countActiveFilters,
  DEFAULT_REVIEW_FILTERS,
  type ReviewFilterOptions,
  type ReviewFiltersState,
} from "./types";

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "PENDENTE_REVISAO", label: "Pendentes" },
  { value: "CONFIRMADA", label: "Validadas" },
  { value: "CORRIGIDA", label: "Corrigidas" },
  { value: "DESCARTADA", label: "Rejeitadas" },
];

interface ReviewFiltersBarProps {
  filters: ReviewFiltersState;
  onChange: (filters: ReviewFiltersState) => void;
  options: ReviewFilterOptions;
  hideStatus?: boolean;
}

const selectClassName =
  "h-10 w-full rounded-[10px] border border-[#DEE1E5] bg-white px-3 text-[12.5px] text-[#2D3034] outline-none transition-colors focus:border-[#F40009]";

const labelClassName =
  "mb-1.5 block text-[11px] font-medium text-[#8A8E94]";

export function ReviewFiltersBar({
  filters,
  onChange,
  options,
  hideStatus = false,
}: ReviewFiltersBarProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = countActiveFilters(filters);

  function patch(partial: Partial<ReviewFiltersState>) {
    onChange({ ...filters, ...partial });
  }

  function clearAll() {
    onChange({ ...DEFAULT_REVIEW_FILTERS, status: filters.status && hideStatus ? filters.status : "" });
  }

  return (
    <div className="rounded-[16px] border border-[#E9EBED] bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A4A9]"
          />

          <input
            type="text"
            value={filters.search}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Buscar por descrição, linha ou equipamento..."
            className="h-10 w-full rounded-[10px] border border-[#DEE1E5] bg-white pl-9 pr-3 text-[12.5px] text-[#2D3034] outline-none transition-colors placeholder:text-[#B3B6BB] focus:border-[#F40009]"
          />
        </div>

        {!hideStatus && (
          <select
            value={filters.status}
            onChange={(event) => patch({ status: event.target.value })}
            className={`${selectClassName} sm:w-[170px]`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border px-4 text-[12px] font-semibold transition-colors ${
            expanded || activeCount > 0
              ? "border-[#F40009] text-[#F40009]"
              : "border-[#DEE1E5] text-[#4A4F55] hover:border-[#C7CBD1]"
          }`}
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
          Filtros
          {activeCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F40009] px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 border-t border-[#EEEEEC] p-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className={labelClassName}>Linha</label>

            <select
              value={filters.lineId}
              onChange={(event) => patch({ lineId: event.target.value })}
              className={selectClassName}
            >
              <option value="">Todas</option>

              {options.lines.map((line) => (
                <option key={line.id} value={String(line.id)}>
                  {line.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClassName}>Equipamento</label>

            <select
              value={filters.equipmentId}
              onChange={(event) => patch({ equipmentId: event.target.value })}
              className={selectClassName}
            >
              <option value="">Todos</option>

              {options.equipments.map((equipment) => (
                <option key={equipment.id} value={String(equipment.id)}>
                  {equipment.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClassName}>Turno</label>

            <select
              value={filters.shift}
              onChange={(event) => patch({ shift: event.target.value })}
              className={selectClassName}
            >
              <option value="">Todos</option>

              {options.shifts.map((shift) => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClassName}>Data de</label>

            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => patch({ dateFrom: event.target.value })}
              className={selectClassName}
            />
          </div>

          <div>
            <label className={labelClassName}>Data até</label>

            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => patch({ dateTo: event.target.value })}
              className={selectClassName}
            />
          </div>

          <div>
            <label className={labelClassName}>
              Confiança da IA: {filters.confidenceMin}% – {filters.confidenceMax}%
            </label>

            <div className="flex h-10 items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={filters.confidenceMin}
                onChange={(event) => {
                  const value = Math.min(
                    Number(event.target.value),
                    filters.confidenceMax,
                  );

                  patch({ confidenceMin: value });
                }}
                className="w-full accent-[#F40009]"
              />

              <input
                type="range"
                min={0}
                max={100}
                value={filters.confidenceMax}
                onChange={(event) => {
                  const value = Math.max(
                    Number(event.target.value),
                    filters.confidenceMin,
                  );

                  patch({ confidenceMax: value });
                }}
                className="w-full accent-[#F40009]"
              />
            </div>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <div className="flex items-center justify-between border-t border-[#EEEEEC] px-4 py-2.5">
          <p className="text-[11px] text-[#9A9EA3]">
            {activeCount} filtro(s) aplicado(s)
          </p>

          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-[11px] font-medium text-[#81868C] transition-colors hover:text-[#F40009]"
          >
            <X size={12} strokeWidth={2} />
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
