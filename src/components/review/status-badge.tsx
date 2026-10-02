interface StatusBadgeProps {
  status: string;
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  PENDENTE_REVISAO: {
    label: "Pendente",
    bg: "color-mix(in srgb, var(--warning) 10%, transparent)",
    color: "var(--warning)",
  },
  CONFIRMADA: {
    label: "Validada",
    bg: "color-mix(in srgb, var(--success) 10%, transparent)",
    color: "var(--success)",
  },
  CORRIGIDA: {
    label: "Corrigida",
    bg: "color-mix(in srgb, var(--chart-neutral) 10%, transparent)",
    color: "var(--chart-neutral)",
  },
  DESCARTADA: {
    label: "Rejeitada",
    bg: "var(--surface-elevated)",
    color: "var(--text-secondary)",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDENTE_REVISAO;

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

export function confidenceColor(value: number): string {
  if (value >= 0.85) return "var(--success)";
  if (value >= 0.7) return "var(--warning)";
  return "var(--error)";
}

export function ConfidenceBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const color = confidenceColor(value);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`, color }}
    >
      {percent}%
    </span>
  );
}
