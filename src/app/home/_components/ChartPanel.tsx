import type { ReactNode } from "react";

interface ChartPanelProps {
  title: string;
  headerRight?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}

export function ChartPanel({
  title,
  headerRight,
  caption,
  children,
}: ChartPanelProps) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border-theme bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border-theme bg-[#F7F8FA] px-5 py-3.5">
        <h3 className="text-[14px] font-semibold text-text-primary">
          {title}
        </h3>

        {headerRight && (
          <span className="text-[12px] text-text-secondary">
            {headerRight}
          </span>
        )}
      </div>

      <div className="px-5 pb-5 pt-4">
        {children}

        {caption && (
          <p className="mt-3 text-center text-[11px] text-text-secondary">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}
