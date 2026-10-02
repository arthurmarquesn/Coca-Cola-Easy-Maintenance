"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  UserPlus,
} from "lucide-react";

import type {
  LucideIcon,
} from "lucide-react";

import { isAnalystRole } from "@/lib/roles";

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

export function DashboardHome({
  user,
  unit,
}: DashboardHomeProps) {
  const firstName =
    getFirstName(
      user.name,
    );

  const isAnalyst =
    isAnalystRole(user.role);

  return (
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
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-2">
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

              <h2 className="mt-6 text-[28px] font-semibold leading-[1.08] tracking-[-0.04em]">
                Importar
                apontamentos
              </h2>

              <p className="mt-3 text-[14px] leading-6 text-white/70">
                Adicione uma nova planilha de manutenção
                ao histórico da unidade.
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between rounded-[16px] bg-white px-5 py-3.5 text-[#E41E2B]">
              <span className="text-[13px] font-semibold">
                Importar planilha
              </span>

              <ArrowRight
                size={18}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </div>
          </Link>

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
        </section>
      </div>
    </main>
  );
}
