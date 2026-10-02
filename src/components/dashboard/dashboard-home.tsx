"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileSpreadsheet,
  History,
<<<<<<< HEAD
  UserPlus,
=======
  LogOut,
  Users,
  Waypoints,
>>>>>>> origin/marques
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import { isAnalystRole } from "@/lib/roles";

import {
  UnitFilter,
} from "@/components/units/unit-filter";


/* =========================================================
   PROPS
========================================================= */

interface DashboardHomeProps {
  user: {
<<<<<<< HEAD
    name: string;
    email?: string;
    role?: string;
  };

  unit: {
    id?: number;
    city: string | null;
=======
    name:
      string;
  };

  unit: {
    city:
      | string
      | null;
>>>>>>> origin/marques
  };
}


/* =========================================================
   HELPERS
========================================================= */

function getFirstName(
  name:
    string,
): string {
  return (
    name
      .trim()
      .split(
        /\s+/,
      )[0] ||
    name
  );
}

<<<<<<< HEAD
interface ModuleCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  className?: string;
}

function ModuleCard({
  href,
  icon: Icon,
  title,
  description,
  action,
  className,
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-[26px] border border-border-theme bg-surface p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-text-secondary hover:shadow-xl ${className ?? ""}`}
    >
      <div>
        <div className="flex items-center gap-3">
          <Icon
            size={20}
            strokeWidth={1.7}
            className="text-text-secondary"
          />

          <h2 className="text-[22px] font-semibold leading-[1.1] tracking-[-0.035em] text-text-title">
            {title}
          </h2>
        </div>

        <p className="mt-3 text-[13px] leading-5 text-text-body">
          {description}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border-theme pt-4">
        <span className="text-[13px] font-semibold text-text-primary">
          {action}
        </span>

        <ArrowRight
          size={18}
          className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}
=======

/* =========================================================
   COMPONENT
========================================================= */
>>>>>>> origin/marques

export function DashboardHome({
  user,
  unit,
}: DashboardHomeProps) {
  const firstName =
    getFirstName(
      user.name,
    );

<<<<<<< HEAD
  const isAnalyst =
    isAnalystRole(user.role);
=======

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(
      false,
    );


  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (
      loggingOut
    ) {
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
>>>>>>> origin/marques


  /* =======================================================
     UI
  ======================================================= */

  return (
<<<<<<< HEAD
    <main className="min-h-screen bg-background-primary transition-colors">
      <AppHeader userName={user.name} city={unit.city} />

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-10 sm:px-8 lg:px-10 lg:pt-12">
        <section>
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.045em] text-text-title sm:text-[42px]">
            Olá, {firstName}.
          </h1>

          <p className="mt-2 text-[14px] leading-6 text-text-body">
            Manutenção orientada por dados
            {unit.city
              ? ` · ${unit.city}`
              : ""}
=======
    <main className="min-h-screen bg-[#F7F7F6]">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-black/[0.05] bg-white">

        <div className="mx-auto flex min-h-[76px] w-full max-w-[1280px] items-center justify-between gap-4 px-6 py-2 sm:px-8 lg:px-10">

          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={180}
            height={64}
            priority
            className="h-auto max-h-[42px] w-auto object-contain"
          />


          <div className="flex items-center gap-3 sm:gap-5">

            {/* ===============================================
                CHECKLIST GLOBAL DE UNIDADES
            ================================================ */}

            <UnitFilter
              fallbackLabel={
                unit.city
              }
            />


            <div className="hidden h-8 w-px bg-black/[0.07] sm:block" />


            <div className="hidden text-right md:block">

              <p className="text-[13px] font-medium text-[#25272A]">
                {user.name}
              </p>


              <p className="mt-0.5 text-[10px] text-[#999DA2]">
                Sessão ativa
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


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-14 sm:px-8 lg:px-10 lg:pt-20">

        {/* =================================================
            HERO
        ================================================== */}

        <section>

          <h1 className="max-w-[760px] text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#181A1D] sm:text-[48px] lg:text-[54px]">
            Manutenção orientada
            por dados.
          </h1>


          <p className="mt-5 max-w-[580px] text-[14px] leading-6 text-[#777B80]">
            Olá, {firstName}. Importe novos apontamentos,
            consulte o histórico ou analise a confiabilidade
            das unidades selecionadas.
>>>>>>> origin/marques
          </p>

        </section>

<<<<<<< HEAD
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-2">
=======

        {/* =================================================
            MAIN CARDS
        ================================================== */}

        <section className="mt-14 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">

          {/* ===============================================
              IMPORT
          ================================================ */}

>>>>>>> origin/marques
          <Link
            href="/dashboard/importar"
            className="group flex flex-col justify-between rounded-[26px] bg-[#E41E2B] p-7 text-white transition-colors duration-200 hover:bg-[#CF1925] sm:col-span-2 lg:col-span-1 lg:row-span-2"
          >

            <div>

              <FileSpreadsheet
                size={25}
                strokeWidth={1.7}
                className="text-white/80"
              />

<<<<<<< HEAD
              <h2 className="mt-6 text-[28px] font-semibold leading-[1.08] tracking-[-0.04em]">
=======

              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em]">
>>>>>>> origin/marques
                Importar
                apontamentos
              </h2>

<<<<<<< HEAD
              <p className="mt-3 text-[14px] leading-6 text-white/70">
                Adicione uma nova planilha de manutenção
                ao histórico da unidade.
=======

              <p className="mt-4 text-[14px] leading-6 text-white/70">
                Adicione uma nova planilha à unidade
                operacional representada pelo usuário.
>>>>>>> origin/marques
              </p>

            </div>

<<<<<<< HEAD
            <div className="mt-8 flex items-center justify-between rounded-[16px] bg-white px-5 py-3.5 text-[#E41E2B]">
=======

            <div className="mt-10 flex items-center justify-between">

>>>>>>> origin/marques
              <span className="text-[13px] font-semibold">
                Importar planilha
              </span>

<<<<<<< HEAD
              <ArrowRight
                size={18}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
=======

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#E41E2B] transition-transform duration-200 group-hover:translate-x-1">

                <ArrowRight
                  size={18}
                />

              </div>

>>>>>>> origin/marques
            </div>

          </Link>

<<<<<<< HEAD
          <ModuleCard
            href="/dashboard/historico"
            icon={History}
            title="Histórico"
            description="Consulte falhas, ocorrências e paradas registradas na manutenção."
            action="Consultar"
          />

          <ModuleCard
            href="/dashboard/confiabilidade"
            icon={Activity}
            title="Confiabilidade"
            description="Identifique concentração de perdas, recorrência e impacto das falhas."
            action="Analisar"
          />

          <ModuleCard
            href="/dashboard/revisao"
            icon={ClipboardCheck}
            title="Validação"
            description="Revise por categoria as classificações sugeridas pela IA e registre o feedback humano."
            action="Revisar"
            className={
              isAnalyst
                ? undefined
                : "sm:col-span-2"
            }
          />

          {isAnalyst && (
            <ModuleCard
              href="/dashboard/usuarios"
              icon={UserPlus}
              title="Usuários"
              description="Cadastre novos usuários e defina a função de cada um no sistema."
              action="Gerenciar"
            />
          )}
=======

          {/* ===============================================
              HISTORY
          ================================================ */}

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
                das unidades selecionadas no filtro.
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


          {/* ===============================================
              RELIABILITY
          ================================================ */}

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
                Compare perdas, recorrência e impacto
                entre as unidades selecionadas.
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


          {/* ===============================================
              MASP
          ================================================ */}

          <Link
            href="/dashboard/masp"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-black/[0.07] bg-white p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >

            <div>

              <Waypoints
                size={25}
                strokeWidth={1.7}
                className="text-[#44484D]"
              />


              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#202225]">
                MASP
              </h2>


              <p className="mt-4 text-[14px] leading-6 text-[#777B80]">
                Investigue problemas, valide causas e acompanhe
                ações com dados locais.
              </p>

            </div>


            <div className="mt-10 flex items-center justify-between border-t border-[#EEEEEC] pt-6">

              <span className="text-[13px] font-semibold text-[#303338]">
                Abrir análises
              </span>


              <ArrowRight
                size={18}
                className="text-[#777C82] transition-transform duration-200 group-hover:translate-x-1"
              />

            </div>

          </Link>

>>>>>>> origin/marques
        </section>


        {/* =================================================
            ADMINISTRATION
        ================================================== */}

        <section className="mt-5">

          <Link
            href="/dashboard/usuarios"
            className="group flex items-center justify-between rounded-[22px] border border-black/[0.07] bg-white px-6 py-5 transition-all duration-200 hover:border-black/[0.12] hover:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"
          >

            <div className="flex items-center gap-4">

              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#F4F4F3] text-[#555A60]">

                <Users
                  size={18}
                  strokeWidth={1.8}
                />

              </div>


              <div>

                <p className="text-[13px] font-semibold text-[#303338]">
                  Usuários
                </p>


                <p className="mt-1 text-[10px] text-[#92979D]">
                  Cadastre representantes das unidades.
                </p>

              </div>

            </div>


            <ArrowRight
              size={17}
              className="text-[#8B9096] transition-transform duration-200 group-hover:translate-x-1"
            />

          </Link>

        </section>

      </div>

    </main>
  );
}
