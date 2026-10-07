import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Waypoints,
} from "lucide-react";

import {
  UnitFilter,
} from "@/components/units/unit-filter";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";


export function MaspShell({
  userName,
  title,
  description,
  backHref =
    "/dashboard",
  children,
  actions,
}: {
  userName: string;
  title: string;
  description: string;
  backHref?: string;
  children:
    React.ReactNode;
  actions?:
    React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background-primary">
      <header className="border-b border-border-theme/[0.05] bg-surface">
        <div className="mx-auto flex min-h-[76px] w-full max-w-[1380px] items-center justify-between gap-4 px-6 py-2 sm:px-8 lg:px-12">
          <Link
            href="/dashboard"
            aria-label="Voltar ao painel"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={64}
              priority
              className="h-auto max-h-[42px] w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-4">
            <UnitFilter
              fallbackLabel="Unidades"
            />

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <div className="hidden text-right md:block">
              <p className="text-[13px] font-medium text-text-primary">
                {userName}
              </p>

              <p className="mt-0.5 text-[10px] text-text-secondary">
                MASP local
              </p>
            </div>

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-9 sm:px-8 lg:px-12">
        <Link
          href={
            backHref
          }
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft
            size={15}
          />
          Voltar
        </Link>

        <div className="mt-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-[780px]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-accent-primary">
              <Waypoints
                size={15}
              />
              Método de análise e solução de problemas
            </div>

            <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[42px]">
              {title}
            </h1>

            <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-text-secondary">
              {description}
            </p>
          </div>

          {actions}
        </div>

        <div className="mt-9">
          {children}
        </div>
      </section>
    </main>
  );
}

