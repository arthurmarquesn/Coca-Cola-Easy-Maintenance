"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Upload,
  UserPlus,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

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

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/* ─── Card secundário ────────────────────────────────────────────────────── */

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
      className={`group flex flex-col justify-between rounded-2xl border border-border-theme bg-surface p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className ?? ""}`}
    >
      {/* Cabeçalho do card */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-elevated">
            <Icon size={18} strokeWidth={1.7} className="text-text-secondary" />
          </div>
          <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.02em] text-text-title dark:text-text-primary">
            {title}
          </h2>
        </div>

        <p className="mt-3 text-sm leading-5 text-text-body">{description}</p>
      </div>

      {/* Rodapé do card — botão pílula */}
      <div className="mt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-theme bg-surface-elevated px-4 py-1.5 text-[13px] font-medium text-text-secondary transition-all duration-150 group-hover:border-accent-primary/30 group-hover:bg-accent-primary/10 group-hover:text-accent-primary">
          {action}
          <ArrowRight
            size={14}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────── */

export function DashboardHome({ user, unit }: DashboardHomeProps) {
  const firstName = getFirstName(user.name);
  const isAdmin = user.role === "ADMIN";

  return (
    <main className="min-h-screen bg-background-primary transition-colors">
      <AppHeader userName={user.name} city={unit.city} />

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-10 sm:px-8 lg:px-10 lg:pt-12">

        {/* ── Saudação ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.045em] text-text-title sm:text-[40px]">
            Olá, {firstName}.
          </h1>
          <p className="mt-2 text-[14px] leading-6 text-text-body">
            Manutenção orientada por dados
            {unit.city ? ` · ${unit.city}` : ""}
          </p>
        </section>

        {/* ── Hero banner — Importar Apontamentos ───────────────────── */}
        <Link
          href="/dashboard/importar"
          className="group flex w-full flex-col items-start justify-between gap-5 rounded-2xl bg-[#D8232A] p-6 transition-colors duration-200 hover:bg-[#C01F25] sm:flex-row sm:items-center"
        >
          {/* Lado esquerdo: ícone + textos */}
          <div className="flex items-start gap-4 sm:items-center">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <FileSpreadsheet size={22} strokeWidth={1.7} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold leading-snug text-white">
                Importar apontamentos
              </h2>
              <p className="mt-0.5 text-sm leading-5 text-white/70">
                Adicione uma nova planilha de manutenção ao histórico da unidade.
              </p>
            </div>
          </div>

          {/* Lado direito: botão pílula branco */}
          <div className="flex flex-shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#D8232A] transition-opacity duration-200 group-hover:opacity-90">
            <Upload size={15} strokeWidth={2} />
            <span>Importar planilha</span>
          </div>
        </Link>

        {/* ── Grade 2 × 2 de módulos ────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
            className={isAdmin ? undefined : "md:col-span-2"}
          />

          {isAdmin && (
            <ModuleCard
              href="/dashboard/usuarios"
              icon={UserPlus}
              title="Usuários"
              description="Cadastre novos usuários e defina a função de cada um no sistema."
              action="Gerenciar"
            />
          )}
        </div>
      </div>
    </main>
  );
}
