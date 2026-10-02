interface KpiCardProps {
  label: string;
  value: string;
  accent?: boolean;
}

export function KpiCard({
  label,
  value,
  accent = false,
}: KpiCardProps) {
  return (
    <div
      className={`rounded-[11px] border bg-surface px-5 py-4 ${
        accent
          ? "border-[#F8C6C8]"
          : "border-border-theme"
      }`}
    >
      <p className="text-[12px] font-medium text-text-secondary">
        {label}
      </p>

      <p
        className={`mt-1.5 text-[26px] font-semibold tracking-[-0.02em] sm:text-[28px] ${
          accent
            ? "text-[#F40009]"
            : "text-text-title"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
