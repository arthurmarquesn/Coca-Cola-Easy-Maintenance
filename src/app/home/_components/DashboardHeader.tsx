import { ThemeSwitcher } from "@/components/theme/theme-switcher";

interface DashboardHeaderProps {
  title: string;
  summary: string;
}

export function DashboardHeader({
  title,
  summary,
}: DashboardHeaderProps) {
  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-2 bg-background-secondary px-4 py-4 sm:px-8 border-b border-border-theme transition-colors">
      <div className="flex items-center gap-4">
        <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-text-primary sm:text-[18px]">
          {title}
        </h1>
        <p className="text-[12px] font-medium text-text-secondary sm:text-[13px] hidden sm:block">
          {summary}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
      </div>
    </header>
  );
}
