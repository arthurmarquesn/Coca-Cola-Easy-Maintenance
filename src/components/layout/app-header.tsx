"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

interface AppHeaderProps {
  userName?: string;
  city?: string | null;
}

export function AppHeader({ userName, city }: AppHeaderProps) {
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

      window.location.href = "/login";
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
          <Image
            src="/logo.webp"
            alt="Coca-Cola"
            width={180}
            height={64}
            priority
            className="h-auto max-h-[42px] w-auto object-contain"
          />

          <div className="hidden h-8 w-px bg-border-theme sm:block" />

          <Image
            src="/femsa-logo.png"
            alt="FEMSA"
            width={544}
            height={129}
            priority
            className="hidden h-[22px] w-auto rounded-[2px] object-contain sm:block"
          />
        </Link>

        <div className="flex items-center gap-5">
          {userName && (
            <>
              <div className="hidden text-right sm:block">
                <p className="text-[13px] font-medium text-text-primary">
                  {userName}
                </p>

                {city && (
                  <p className="mt-0.5 text-[11px] text-text-body">
                    {city}
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
            className="group flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-[#E41E2B] disabled:cursor-not-allowed disabled:opacity-40"
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
