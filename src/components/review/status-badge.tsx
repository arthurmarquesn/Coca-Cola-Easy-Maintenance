interface StatusBadgeProps {
  status: string;
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  PENDENTE_REVISAO: {
    label: "Pendente",
    bg: "#FFF7E6",
    color: "#B8860B",
  },
  CONFIRMADA: {
    label: "Validada",
    bg: "#F0F9F1",
    color: "#238636",
  },
  CORRIGIDA: {
    label: "Corrigida",
    bg: "#EEF3FF",
    color: "#2E5AAC",
  },
  DESCARTADA: {
    label: "Rejeitada",
    bg: "#F3F3F4",
    color: "#6B6F75",
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
  if (value >= 0.85) return "#238636";
  if (value >= 0.7) return "#B8860B";
  return "#C92A32";
}

export function ConfidenceBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const color = confidenceColor(value);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {percent}%
    </span>
  );
}
