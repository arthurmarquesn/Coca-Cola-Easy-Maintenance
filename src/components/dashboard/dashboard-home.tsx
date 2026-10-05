"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  LogOut,
  Users,
  Waypoints,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  UnitFilter,
} from "@/components/units/unit-filter";

import {
  isAnalystRole,
} from "@/lib/roles";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";


/* =========================================================
   PROPS
========================================================= */

interface DashboardHomeProps {
  user: {
    name:
      string;

    role:
      string;
  };

  unit: {
    city:
      | string
      | null;
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


/* =========================================================
   COMPONENT
========================================================= */

export function DashboardHome({
  user,
  unit,
}: DashboardHomeProps) {
  const firstName =
    getFirstName(
      user.name,
    );


  /* Gestor apenas consulta: o cadastro de usuários fica
     oculto para ele, como a API já exige. */
  const isAnalyst =
    isAnalystRole(
      user.role,
    );


  const router = useRouter();
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


      router.replace("/login");
      router.refresh();
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


  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="min-h-screen bg-surface-elevated">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-border-theme/[0.05] bg-surface">

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


            <div className="hidden h-8 w-px bg-border-theme sm:block" />


            <div className="hidden text-right md:block">

              <p className="text-[13px] font-medium text-text-primary">
                {user.name}
              </p>


              <p className="mt-0.5 text-[10px] text-text-secondary">
                Sessão ativa
              </p>

            </div>

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <ThemeSwitcher />


            <div className="h-8 w-px bg-border-theme" />


            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              disabled={
                loggingOut
              }
              className="group flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-[#E41E2B] disabled:cursor-not-allowed disabled:opacity-40"
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

          <h1 className="max-w-[760px] text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] text-text-primary sm:text-[48px] lg:text-[54px]">
            Manutenção orientada
            por dados.
          </h1>


          <p className="mt-5 max-w-[580px] text-[14px] leading-6 text-text-secondary">
            Olá, {firstName}. Importe novos apontamentos,
            consulte o histórico ou analise a confiabilidade
            das unidades selecionadas.
          </p>

        </section>


        {/* =================================================
            MAIN CARDS
        ================================================== */}

        <section
          className={`mt-14 grid gap-5 lg:grid-cols-2 ${
            /* Analista: 5 cards (com Importar); Gestor: 4. */
            isAnalyst
              ? "xl:grid-cols-5"
              : "xl:grid-cols-4"
          }`}
        >

          {/* ===============================================
              IMPORT
              Gestor apenas consulta; a API recusa a importação.
          ================================================ */}

          {isAnalyst && (
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
                Adicione uma nova planilha à unidade
                operacional representada pelo usuário.
              </p>

            </div>


            <div className="mt-10 flex items-center justify-between">

              <span className="text-[13px] font-semibold">
                Importar planilha
              </span>


              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-[#E41E2B] transition-transform duration-200 group-hover:translate-x-1">

                <ArrowRight
                  size={18}
                />

              </div>

            </div>

          </Link>
          )}


          {/* ===============================================
              HISTORY
          ================================================ */}

          <Link
            href="/dashboard/historico"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-border-theme/[0.07] bg-surface p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-theme/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >

            <div>

              <History
                size={25}
                strokeWidth={1.7}
                className="text-text-primary"
              />


              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
                Histórico
              </h2>


              <p className="mt-4 text-[14px] leading-6 text-text-secondary">
                Consulte falhas, ocorrências e paradas
                das unidades selecionadas no filtro.
              </p>

            </div>


            <div className="mt-10 flex items-center justify-between border-t border-border-theme pt-6">

              <span className="text-[13px] font-semibold text-text-primary">
                Consultar
              </span>


              <ArrowRight
                size={18}
                className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
              />

            </div>

          </Link>


          {/* ===============================================
              RELIABILITY
          ================================================ */}

          <Link
            href="/dashboard/confiabilidade"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-border-theme/[0.07] bg-surface p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-theme/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >

            <div>

              <Activity
                size={25}
                strokeWidth={1.7}
                className="text-text-primary"
              />


              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
                Confiabilidade
              </h2>


              <p className="mt-4 text-[14px] leading-6 text-text-secondary">
                Compare perdas, recorrência e impacto
                entre as unidades selecionadas.
              </p>

            </div>


            <div className="mt-10 flex items-center justify-between border-t border-border-theme pt-6">

              <span className="text-[13px] font-semibold text-text-primary">
                Analisar
              </span>


              <ArrowRight
                size={18}
                className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
              />

            </div>

          </Link>


          {/* ===============================================
              MASP
          ================================================ */}

          <Link
            href="/dashboard/masp"
            className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-border-theme/[0.07] bg-surface p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-theme/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
          >

            <div>

              <Waypoints
                size={25}
                strokeWidth={1.7}
                className="text-text-primary"
              />


              <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
                MASP
              </h2>


              <p className="mt-4 text-[14px] leading-6 text-text-secondary">
                Investigue problemas, valide causas e acompanhe
                ações com dados locais.
              </p>

            </div>


            <div className="mt-10 flex items-center justify-between border-t border-border-theme pt-6">

              <span className="text-[13px] font-semibold text-text-primary">
                Abrir análises
              </span>


              <ArrowRight
                size={18}
                className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
              />

            </div>

          </Link>


        {/* ===============================================
            VALIDAÇÃO HUMANA
        ================================================ */}

        <Link
          href="/dashboard/revisao"
          className="group flex min-h-[330px] flex-col justify-between rounded-[30px] border border-border-theme/[0.07] bg-surface p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-theme/[0.12] hover:shadow-[0_16px_40px_rgba(0,0,0,0.045)]"
        >

          <div>

            <ClipboardCheck
              size={25}
              strokeWidth={1.7}
              className="text-text-primary"
            />


            <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
              Validação
            </h2>


            <p className="mt-4 text-[14px] leading-6 text-text-secondary">
              Revise por categoria as classificações sugeridas
              pela IA e registre o feedback humano.
            </p>

          </div>


          <div className="mt-10 flex items-center justify-between border-t border-border-theme pt-6">

            <span className="text-[13px] font-semibold text-text-primary">
              Revisar
            </span>


            <ArrowRight
              size={18}
              className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
            />

          </div>

        </Link>

        </section>


        {/* =================================================
            ADMINISTRATION
        ================================================== */}

        {isAnalyst && (
          <section className="mt-5">

            <Link
              href="/dashboard/usuarios"
              className="group flex items-center justify-between rounded-[22px] border border-border-theme/[0.07] bg-surface px-6 py-5 transition-all duration-200 hover:border-border-theme/[0.12] hover:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"
            >

              <div className="flex items-center gap-4">

                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-surface-elevated text-text-primary">

                  <Users
                    size={18}
                    strokeWidth={1.8}
                  />

                </div>


                <div>

                  <p className="text-[13px] font-semibold text-text-primary">
                    Usuários
                  </p>


                  <p className="mt-1 text-[10px] text-text-secondary">
                    Cadastre representantes das unidades.
                  </p>

                </div>

              </div>


              <ArrowRight
                size={17}
                className="text-text-secondary transition-transform duration-200 group-hover:translate-x-1"
              />

            </Link>

          </section>
        )}

      </div>

    </main>
  );
}
