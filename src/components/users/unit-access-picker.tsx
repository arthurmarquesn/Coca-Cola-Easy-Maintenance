"use client";

import { Check } from "lucide-react";

export interface PickerUnit {
  id: number;
  code: string | null;
  name: string;
}

interface UnitAccessPickerProps {
  units: PickerUnit[];
  primaryUnitId: number | null;
  selectedIds: number[];
  onChange: (unitIds: number[]) => void;
  disabled?: boolean;
}

/*
 * Unidades de acesso além da principal. Só o Analista
 * recebe unidades extras; o Gestor fica na principal
 * (regra validada também em /api/users).
 */
export function UnitAccessPicker({
  units,
  primaryUnitId,
  selectedIds,
  onChange,
  disabled = false,
}: UnitAccessPickerProps) {
  const options = units.filter((unit) => unit.id !== primaryUnitId);
  const selected = new Set(selectedIds);

  if (options.length === 0) {
    return (
      <p className="mt-3 text-[10px] leading-4 text-text-secondary">
        Nenhuma outra unidade disponível para vincular.
      </p>
    );
  }

  function toggle(unitId: number) {
    onChange(
      selected.has(unitId)
        ? selectedIds.filter((id) => id !== unitId)
        : [...selectedIds, unitId],
    );
  }

  return (
    <div className="mt-3 max-h-[220px] overflow-y-auto rounded-[12px] border border-border-theme bg-surface p-1.5">
      {options.map((unit) => {
        const checked = selected.has(unit.id);

        return (
          <button
            key={unit.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => toggle(unit.id)}
            className="flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={[
                "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                checked
                  ? "border-accent-primary bg-accent-primary text-white"
                  : "border-border-theme bg-surface text-transparent",
              ].join(" ")}
            >
              <Check size={11} strokeWidth={2.6} />
            </span>

            <span className="min-w-0 truncate text-[12px] text-text-primary">
              {unit.name}
              {unit.code && (
                <span className="text-text-secondary"> — {unit.code}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
