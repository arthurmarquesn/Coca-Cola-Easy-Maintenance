interface DashboardHeaderProps {
  title: string;
  summary: string;
}

export function DashboardHeader({
  title,
  summary,
}: DashboardHeaderProps) {
  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-2 bg-[#F40009] px-4 py-4 sm:px-8">
      <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-white sm:text-[18px]">
        {title}
      </h1>

      <p className="text-[12px] font-medium text-white/85 sm:text-[13px]">
        {summary}
      </p>
    </header>
  );
}
