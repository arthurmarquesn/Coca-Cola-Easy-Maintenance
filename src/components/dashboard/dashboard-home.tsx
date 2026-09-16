"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  LogOut,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

interface DashboardHomeProps {
  user: {
    name: string;
    email: string;
    role: string;
  };

  unit: {
    id: number;
    city: string | null;
  };
}

/* =========================================================
   COMPONENTE
========================================================= */

export function DashboardHome({
  user,
  unit,
}: DashboardHomeProps) {
  const router = useRouter();

  const [entering, setEntering] =
    useState(true);

  const [loggingOut, setLoggingOut] =
    useState(false);

  /* =======================================================
     PRIMEIRO NOME
  ======================================================= */

  const firstName = useMemo(() => {
    return (
      user.name
        .trim()
        .split(/\s+/)[0] ||
      user.name
    );
  }, [user.name]);

  /* =======================================================
     TRANSIÇÃO DE ENTRADA
  ======================================================= */

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setEntering(false);
      }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
        },
      );

      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white">

      {/* ===================================================
          TRANSIÇÃO VINDO DO LOGIN
      ==================================================== */}

      <div
        className={`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-[#F40009] transition-transform duration-[1100ms] ease-[cubic-bezier(0.65,0,0.35,1)] ${
          entering
            ? "translate-x-0"
            : "translate-x-full"
        }`}
        aria-hidden="true"
      >
        <Image
          src="/logo.webp"
          alt=""
          width={240}
          height={110}
          className={`h-auto w-[185px] object-contain brightness-0 invert transition-opacity duration-500 ${
            entering
              ? "opacity-100"
              : "opacity-0"
          }`}
        />
      </div>

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-[#E8E9EB] bg-white">

        <div className="mx-auto flex h-[78px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">

          {/* Logo */}

          <Link
            href="/dashboard"
            className="flex items-center"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={70}
              priority
              className="h-auto max-h-[52px] w-auto max-w-[140px] object-contain"
            />
          </Link>

          {/* Usuário */}

          <div className="flex items-center gap-5">

            <div className="hidden text-right sm:block">

              <p className="text-[13px] font-medium text-[#2D3034]">
                {user.name}
              </p>

              {unit.city && (
                <p className="mt-0.5 text-[11px] text-[#979BA1]">
                  {unit.city}
                </p>
              )}

            </div>

            <div className="h-7 w-px bg-[#E6E7E9]" />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#7E8389] transition-colors duration-200 hover:bg-[#F6F7F8] hover:text-[#F40009] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Sair"
            >
              <LogOut
                size={18}
                strokeWidth={1.8}
              />
            </button>

          </div>

        </div>

      </header>

      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1080px] px-6 pb-16 pt-20 sm:px-8 lg:px-12 lg:pt-24">

        {/* Cabeçalho */}

        <div className="max-w-[620px]">

          <p className="text-[14px] text-[#8B9096]">
            Olá, {firstName}.
          </p>

          <h1 className="mt-2 text-[36px] font-semibold leading-[1.1] tracking-[-0.045em] text-[#191B1E] sm:text-[42px]">
            O que você deseja fazer?
          </h1>

          <p className="mt-4 max-w-[520px] text-[14px] leading-7 text-[#7D8288]">
            Selecione uma opção para continuar.
          </p>

        </div>

        {/* =================================================
            OPÇÕES
        ================================================== */}

        <div className="mt-12 grid gap-5 md:grid-cols-2">

          {/* ===============================================
              IMPORTAR
          ================================================ */}

          <Link
            href="/dashboard/importar"
            className="group flex min-h-[270px] flex-col justify-between rounded-[18px] border border-[#E1E3E6] bg-white p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#CACDD1] hover:shadow-[0_14px_35px_rgba(20,20,20,0.06)]"
          >

            <div>

              <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#F40009] text-white">
                <FileSpreadsheet
                  size={22}
                  strokeWidth={1.8}
                />
              </div>

              <h2 className="mt-7 text-[23px] font-semibold tracking-[-0.035em] text-[#202225]">
                Importar planilha
              </h2>

              <p className="mt-3 max-w-[360px] text-[13px] leading-6 text-[#7F848A]">
                Envie uma nova planilha Excel com os apontamentos operacionais
                para processamento.
              </p>

            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[#ECEDEF] pt-5">

              <span className="text-[13px] font-medium text-[#4B4F54] transition-colors duration-200 group-hover:text-[#F40009]">
                Importar dados
              </span>

              <ArrowRight
                size={18}
                strokeWidth={1.8}
                className="text-[#94999F] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#F40009]"
              />

            </div>

          </Link>

          {/* ===============================================
              HISTÓRICO
          ================================================ */}

          <Link
            href="/dashboard/historico"
            className="group flex min-h-[270px] flex-col justify-between rounded-[18px] border border-[#E1E3E6] bg-white p-8 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#CACDD1] hover:shadow-[0_14px_35px_rgba(20,20,20,0.06)]"
          >

            <div>

              <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#F4F5F6] text-[#363A3F]">
                <BarChart3
                  size={22}
                  strokeWidth={1.8}
                />
              </div>

              <h2 className="mt-7 text-[23px] font-semibold tracking-[-0.035em] text-[#202225]">
                Analisar histórico
              </h2>

              <p className="mt-3 max-w-[360px] text-[13px] leading-6 text-[#7F848A]">
                Consulte os dados históricos de manutenção e analise o
                desempenho dos equipamentos.
              </p>

            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[#ECEDEF] pt-5">

              <span className="text-[13px] font-medium text-[#4B4F54] transition-colors duration-200 group-hover:text-[#F40009]">
                Acessar histórico
              </span>

              <ArrowRight
                size={18}
                strokeWidth={1.8}
                className="text-[#94999F] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#F40009]"
              />

            </div>

          </Link>

        </div>

        {/* =================================================
            RODAPÉ
        ================================================== */}

        {unit.city && (
          <div className="mt-10 border-t border-[#ECEDEF] pt-5">
            <p className="text-[11px] text-[#A0A4A9]">
              {unit.city}
            </p>
          </div>
        )}

      </section>

    </main>
  );
}