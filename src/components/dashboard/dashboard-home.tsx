"use client";

import Image from "next/image";
import Link from "next/link";

import {
  Activity,
  ArrowRight,
  FileSpreadsheet,
  History,
  LogOut,
  UserPlus,
} from "lucide-react";

import {
  useState,
} from "react";

interface DashboardHomeProps {
  user: {
    name: string;
    email?: string;
    role?: string;
  };

  unit: {
    id?: number;
    city: string | null;
  };
}

function getFirstName(
  name: string,
): string {
  return (
    name
      .trim()
      .split(/\s+/)[0] ||
    name
  );
}

export function DashboardHome({
  user,
  unit,
}: DashboardHomeProps) {
  const firstName =
    getFirstName(
      user.name,
    );

  const isAdmin =
    user.role === "ADMIN";

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/auth/logout",
          {
            method:
              "POST",
          },
        );

      if (
        !response.ok
      ) {
        throw new Error(
          "Não foi possível encerrar a sessão.",
        );
      }

      window.location.href =
        "/login";
    } catch (
      error
    ) {
      console.error(
        "Erro ao sair:",
        error,
      );

      setLoggingOut(
        false,
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F7F6]">
      <header className="border-b border-black/[0.05] bg-white">
        <div className="mx-auto flex h-[76px] w-full max-w-[1280px] items-center justify-between px-6 sm:px-8 lg:px-10">
          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={180}
            height={64}
            priority
            className="h-auto max-h-[42px] w-auto object-contain"
          />

          <div className="flex items-center gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium text-[#25272A]">
                {user.name}
              </p>

              <p className="mt-0.5 text-[11px] text-[#999DA2]">
                {unit.city}
              </p>
            </div>

            <div className="h-8 w-px bg-black/[0.07]" />

            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              disabled={
                loggingOut
              }
              className="group flex items-center gap-2 text-[12px] font-medium text-[#777B80] transition-colors hover:text-[#E41E2B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LogOut
                size={16}
                strokeWidth={1.8}
              />

              <span className="hidden sm:inline">
                {loggingOut
                  ? "Saindo..."
                  : "Sair"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-14 sm:px-8 lg:px-10 lg:pt-20">
        <section>
          <h1 className="max-w-[760px] text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#181A1D] sm:text-[48px] lg:text-[54px]">
            Manutenção orientada
            por dados.
          </h1>

          <p className="mt-5 max-w-[520px] text-[14px] leading-6 text-[#777B80]">
            Olá, {firstName}. Importe novos apontamentos,
            consulte o histórico ou analise a confiabilidade
            da unidade.
          </p>
        </section>

        <section
          className={`mt-14 grid gap-5 ${
            isAdmin
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : "lg:grid-cols-3"
          }`}
        >
          <Link
            href="/dashboard/importar"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] bg-[#E41E2B] p-8 text-white transition-colors duration-200 hover:bg-[#CF1925]"
          >
            <div>
              <FileSpreadsheet
                size={25}
                strokeWidth={1.7}
                className="text-white/80"
              />

              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em]">
                Importar
                apontamentos
              </h2>

              <p className="mt-4 text-[14px] leading-6 text-white/70">
                Adicione uma nova planilha de manutenção
                ao histórico da unidade.
              </p>
            </div>

            <div className="mt-10 flex items-center justify-between">
              <span className="text-[13px] font-semibold">
                Importar planilha
              </span>

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#E41E2B] transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRight
                  size={18}
                />
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/historico"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-black/[0.07] bg-white p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >
            <div>
              <History
                size={25}
                strokeWidth={1.7}
                className="text-[#44484D]"
              />

              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#202225]">
                Histórico
              </h2>

              <p className="mt-4 text-[14px] leading-6 text-[#777B80]">
                Consulte falhas, ocorrências e paradas
                registradas na manutenção.
              </p>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-[#EEEEEC] pt-6">
              <span className="text-[13px] font-semibold text-[#303338]">
                Consultar
              </span>

              <ArrowRight
                size={18}
                className="text-[#777C82] transition-transform duration-200 group-hover:translate-x-1"
              />
            </div>
          </Link>

          <Link
            href="/dashboard/confiabilidade"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-black/[0.07] bg-white p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >
            <div>
              <Activity
                size={25}
                strokeWidth={1.7}
                className="text-[#44484D]"
              />

              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#202225]">
                Confiabilidade
              </h2>

              <p className="mt-4 text-[14px] leading-6 text-[#777B80]">
                Identifique concentração de perdas,
                recorrência e impacto das falhas.
              </p>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-[#EEEEEC] pt-6">
              <span className="text-[13px] font-semibold text-[#303338]">
                Analisar
              </span>

              <ArrowRight
                size={18}
                className="text-[#777C82] transition-transform duration-200 group-hover:translate-x-1"
              />
            </div>
          </Link>

          {isAdmin && (
            <Link
              href="/dashboard/usuarios"
              className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-black/[0.07] bg-white p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
            >
              <div>
                <UserPlus
                  size={25}
                  strokeWidth={1.7}
                  className="text-[#44484D]"
                />

                <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#202225]">
                  Usuários
                </h2>

                <p className="mt-4 text-[14px] leading-6 text-[#777B80]">
                  Cadastre novos usuários e defina a
                  função de cada um no sistema.
                </p>
              </div>

              <div className="mt-10 flex items-center justify-between border-t border-[#EEEEEC] pt-6">
                <span className="text-[13px] font-semibold text-[#303338]">
                  Gerenciar
                </span>

                <ArrowRight
                  size={18}
                  className="text-[#777C82] transition-transform duration-200 group-hover:translate-x-1"
                />
              </div>
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
