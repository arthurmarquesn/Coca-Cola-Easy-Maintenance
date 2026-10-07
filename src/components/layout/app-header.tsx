"use client";

import { BrandLogo } from "@/components/layout/brand-logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

interface AppHeaderProps {
  userName?: string;
  unitName?: string | null;
}

export function AppHeader({ userName, unitName }: AppHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Não foi possível encerrar a sessão.");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Erro ao sair:", error);
      setLoggingOut(false);
    }
  }

  return (
    <header className="border-b border-border-theme bg-background-secondary transition-colors">
      <div className="mx-auto flex h-[76px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          aria-label="Início"
          className="flex items-center gap-4"
        >
          <BrandLogo />
        </Link>

        <div className="flex items-center gap-5">
          {userName && (
            <>
              <div className="hidden text-right sm:block">
                <p className="text-[13px] font-medium text-text-primary">
                  {userName}
                </p>

                {unitName && (
                  <p className="mt-0.5 text-[11px] text-text-body">
                    {unitName}
                  </p>
                )}
              </div>

              <div className="hidden h-8 w-px bg-border-theme sm:block" />
            </>
          )}

          <ThemeSwitcher />

          <div className="h-8 w-px bg-border-theme" />

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="group flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogOut size={16} strokeWidth={1.8} />

            <span className="hidden sm:inline">
              {loggingOut ? "Saindo..." : "Sair"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
