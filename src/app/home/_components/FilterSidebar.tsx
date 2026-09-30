import { useMemo, useState, type ReactNode } from "react";

import type {
  AnalysisType,
  FilterOption,
  PeriodOption,
} from "../data";

const ANALYSIS_TYPE_OPTIONS: {
  value: AnalysisType;
  label: string;
}[] = [
  { value: "equipamentos", label: "Equipamentos" },
  { value: "linhas", label: "Linhas de produção" },
  { value: "modos-falha", label: "Modos de falha" },
];

const TOP_N_MIN = 5;
const TOP_N_MAX = 20;

const PERIOD_MIN_DATE = "2026-01-01";
const PERIOD_MAX_DATE = "2026-09-08";

interface FilterSidebarProps {
  analysisType: AnalysisType;
  onAnalysisTypeChange: (value: AnalysisType) => void;

  period: string;
  onPeriodChange: (value: string) => void;
  periodOptions: PeriodOption[];

  customFrom: string;
  onCustomFromChange: (value: string) => void;
  customTo: string;
  onCustomToChange: (value: string) => void;

  unit: string;
  onUnitChange: (value: string) => void;
  unitOptions: FilterOption[];

  line: string;
  onLineChange: (value: string) => void;
  lineOptions: FilterOption[];

  turno: string;
  onTurnoChange: (value: string) => void;
  turnoOptions: FilterOption[];

  equipamento: string;
  onEquipamentoChange: (value: string) => void;
  equipamentoOptions: FilterOption[];

  sistema: string;
  onSistemaChange: (value: string) => void;
  sistemaOptions: FilterOption[];

  subsistema: string;
  onSubsistemaChange: (value: string) => void;
  subsistemaOptions: FilterOption[];

  topN: number;
  onTopNChange: (value: number) => void;
}

function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[12px] font-semibold text-[#323438]">
        {label}
      </p>

      {children}
    </div>
  );
}

function SidebarSelect({
  value,
  onChange,
  options,
  helperText,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  helperText?: string;
}) {
  return (
    <div>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-[46px] w-full appearance-none rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] bg-[right_1rem_center] bg-no-repeat px-4 text-[13px] text-[#232529] outline-none transition-colors duration-200 hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      {helperText && (
        <p className="mt-1.5 text-[11px] text-[#9BA0A7]">
          {helperText}
        </p>
      )}
    </div>
  );
}

function SidebarSearchableSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel =
    options.find((option) => option.value === value)
      ?.label ?? "";

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      option.label
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [options, query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selectedLabel}
        placeholder="Buscar..."
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() =>
          setTimeout(() => setOpen(false), 120)
        }
        className="h-[46px] w-full rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] px-4 text-[13px] text-[#232529] outline-none transition-colors duration-200 hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)]"
      />

      {open && (
        <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[11px] border border-[#E9EBEE] bg-white p-1.5 shadow-lg">
          {filteredOptions.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-[#9BA0A7]">
              Nenhum resultado
            </p>
          )}

          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) =>
                event.preventDefault()
              }
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                setQuery("");
              }}
              className={`block w-full rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-[#F7F8FA] ${
                option.value === value
                  ? "font-semibold text-[#F40009]"
                  : "text-[#323438]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterSidebar({
  analysisType,
  onAnalysisTypeChange,
  period,
  onPeriodChange,
  periodOptions,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  unit,
  onUnitChange,
  unitOptions,
  line,
  onLineChange,
  lineOptions,
  turno,
  onTurnoChange,
  turnoOptions,
  equipamento,
  onEquipamentoChange,
  equipamentoOptions,
  sistema,
  onSistemaChange,
  sistemaOptions,
  subsistema,
  onSubsistemaChange,
  subsistemaOptions,
  topN,
  onTopNChange,
}: FilterSidebarProps) {
  const selectedPeriod = periodOptions.find(
    (option) => option.value === period,
  );

  return (
    <div className="space-y-7 rounded-[11px] border border-[#E9EBEE] bg-white p-5">
      <SidebarSection label="Tipo de análise">
        <div className="space-y-2.5">
          {ANALYSIS_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#323438]"
            >
              <input
                type="radio"
                name="analysisType"
                value={option.value}
                checked={
                  analysisType === option.value
                }
                onChange={() =>
                  onAnalysisTypeChange(option.value)
                }
                className="h-[15px] w-[15px] cursor-pointer border-[#CACED4] accent-[#F40009]"
              />

              {option.label}
            </label>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection label="Período">
        <SidebarSelect
          value={period}
          onChange={onPeriodChange}
          options={periodOptions}
          helperText={
            selectedPeriod && period !== "custom"
              ? `${selectedPeriod.range.from} - ${selectedPeriod.range.to}`
              : undefined
          }
        />

        {period === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <p className="mb-1 text-[11px] text-[#9BA0A7]">
                Data inicial
              </p>

              <input
                type="date"
                value={customFrom}
                min={PERIOD_MIN_DATE}
                max={customTo || PERIOD_MAX_DATE}
                onChange={(event) =>
                  onCustomFromChange(
                    event.target.value,
                  )
                }
                className="h-[42px] w-full rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] px-3 text-[13px] text-[#232529] outline-none transition-colors duration-200 hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)]"
              />
            </div>

            <div>
              <p className="mb-1 text-[11px] text-[#9BA0A7]">
                Data final
              </p>

              <input
                type="date"
                value={customTo}
                min={customFrom || PERIOD_MIN_DATE}
                max={PERIOD_MAX_DATE}
                onChange={(event) =>
                  onCustomToChange(event.target.value)
                }
                className="h-[42px] w-full rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] px-3 text-[13px] text-[#232529] outline-none transition-colors duration-200 hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)]"
              />
            </div>
          </div>
        )}
      </SidebarSection>

      <SidebarSection label="Unidade">
        <SidebarSelect
          value={unit}
          onChange={onUnitChange}
          options={unitOptions}
          helperText="multi-select por checkbox"
        />
      </SidebarSection>

      <SidebarSection label="Linha">
        <SidebarSelect
          value={line}
          onChange={onLineChange}
          options={lineOptions}
        />
      </SidebarSection>

      <SidebarSection label="Turno">
        <div className="space-y-2.5">
          {turnoOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#323438]"
            >
              <input
                type="radio"
                name="turno"
                value={option.value}
                checked={turno === option.value}
                onChange={() =>
                  onTurnoChange(option.value)
                }
                className="h-[15px] w-[15px] cursor-pointer border-[#CACED4] accent-[#F40009]"
              />

              {option.label}
            </label>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection label="Equipamento">
        <SidebarSearchableSelect
          value={equipamento}
          onChange={onEquipamentoChange}
          options={equipamentoOptions}
        />
      </SidebarSection>

      <SidebarSection label="Sistema">
        <SidebarSearchableSelect
          value={sistema}
          onChange={onSistemaChange}
          options={sistemaOptions}
        />
      </SidebarSection>

      <SidebarSection label="Subsistema">
        <SidebarSearchableSelect
          value={subsistema}
          onChange={onSubsistemaChange}
          options={subsistemaOptions}
        />
      </SidebarSection>

      <SidebarSection label={`Top N - ${topN}`}>
        <input
          type="range"
          min={TOP_N_MIN}
          max={TOP_N_MAX}
          step={1}
          value={topN}
          onChange={(event) =>
            onTopNChange(Number(event.target.value))
          }
          className="h-[6px] w-full cursor-pointer appearance-none rounded-full bg-[#E9EBEE] accent-[#F40009]"
        />

        <div className="mt-1.5 flex justify-between text-[11px] text-[#9BA0A7]">
          <span>{TOP_N_MIN}</span>
          <span>{TOP_N_MAX}</span>
        </div>
      </SidebarSection>
    </div>
  );
}
