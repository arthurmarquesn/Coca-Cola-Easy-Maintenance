"use client";

import Image from "next/image";
import Link from "next/link";

import {
  Activity,
  ArrowRight,
  Bot,
  FileSpreadsheet,
  History,
  LogOut,
  Users,
  Waypoints,
  PawPrint
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { UnitFilter } from "@/components/units/unit-filter";

/* =========================================================
   PROPS
========================================================= */

interface DashboardHomeProps {
  user: {
    name: string;
  };

  unit: {
    city: string | null;
  };
}

/* =========================================================
   TYPES
========================================================= */

interface ModuleCardData {
  href: string;
  title: string;
  description: string;
  action: string;
  variant: "red" | "white" | "dark";
  icon: React.ReactNode;
}

interface ProductIntroSlide {
  id: string;
  name: string;
  subtitle: string;
  bg: string;
  text: string;
  image: string;
}

/* =========================================================
   DATA
========================================================= */

const INTRO_STORAGE_KEY =
  "dashboard-home-intro-played";

const INTRO_SLIDE_DURATION = 900;
const INTRO_FINAL_HOLD = 650;
const INTRO_EXIT_DURATION = 700;

const PRODUCT_INTRO_SLIDES: ProductIntroSlide[] = [
  {
    id: "coca-original",
    name: "Coca-Cola Original",
    subtitle: "Portfólio Coca-Cola FEMSA",
    bg: "#E41E2B",
    text: "#FFFFFF",
    image: "/products/coca-original.png",
  },

  {
    id: "coca-zero",
    name: "Coca-Cola Sem Açúcar",
    subtitle: "Portfólio Coca-Cola FEMSA",
    bg: "#1E1F23",
    text: "#FFFFFF",
    image: "/products/coca-zero.png",
  },

  {
    id: "powerade",
    name: "Powerade",
    subtitle: "Portfólio Coca-Cola FEMSA",
    bg: "#1EC7F1",
    text: "#0C1820",
    image: "/products/powerade.png",
  },

  {
    id: "schweppes",
    name: "Schweppes",
    subtitle: "Portfólio Coca-Cola FEMSA",
    bg: "#F3C600",
    text: "#1B1B1B",
    image: "/products/schweppes.png",
  },

  {
    id: "monster",
    name: "Monster",
    subtitle: "Portfólio Coca-Cola FEMSA",
    bg: "#93C900",
    text: "#081107",
    image: "/products/monster.png",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function getFirstName(
  name: string,
): string {
  return (
    name.trim().split(/\s+/)[0] ||
    name
  );
}

/* =========================================================
   PRODUCT INTRO OVERLAY
========================================================= */

function ProductEntryIntro({
  onFinish,
}: {
  onFinish: () => void;
}) {
  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [closing, setClosing] =
    useState(false);

  const timeoutRefs = useRef<number[]>(
    [],
  );

  const slides =
    PRODUCT_INTRO_SLIDES;

  useEffect(() => {
    const clearAll = () => {
      timeoutRefs.current.forEach(
        (timeoutId) =>
          window.clearTimeout(timeoutId),
      );

      timeoutRefs.current = [];
    };

    for (
      let i = 1;
      i < slides.length;
      i += 1
    ) {
      const timeoutId =
        window.setTimeout(() => {
          setCurrentIndex(i);
        }, i * INTRO_SLIDE_DURATION);

      timeoutRefs.current.push(timeoutId);
    }

    const closeStart =
      slides.length *
        INTRO_SLIDE_DURATION +
      INTRO_FINAL_HOLD;

    const startClosingId =
      window.setTimeout(() => {
        setClosing(true);
      }, closeStart);

    timeoutRefs.current.push(
      startClosingId,
    );

    const finishId =
      window.setTimeout(() => {
        onFinish();
      }, closeStart + INTRO_EXIT_DURATION);

    timeoutRefs.current.push(finishId);

    return clearAll;
  }, [onFinish, slides.length]);

  return (
    <div
      className={[
        "fixed inset-0 z-[100] overflow-hidden",
        "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        closing
          ? "pointer-events-none opacity-0"
          : "opacity-100",
      ].join(" ")}
    >
      {slides.map(
        (slide, index) => {
          const isActive =
            index === currentIndex;

          const isPast =
            index < currentIndex;

          return (
            <div
              key={slide.id}
              className={[
                "absolute inset-0",
                "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                isActive
                  ? "translate-x-0 opacity-100"
                  : isPast
                    ? "-translate-x-full opacity-0"
                    : "translate-x-full opacity-0",
              ].join(" ")}
              style={{
                backgroundColor:
                  slide.bg,
                color: slide.text,
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_26%)]" />

              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_40%,rgba(0,0,0,0.06))]" />

              <div className="absolute left-[6%] top-[8%] h-[120px] w-[120px] rounded-full bg-white/10 blur-3xl" />

              <div className="absolute bottom-[8%] right-[7%] h-[160px] w-[160px] rounded-full bg-black/10 blur-3xl" />

              <div className="relative mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-10 px-8 sm:px-12 lg:px-16">
                <div className="max-w-[520px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                    {slide.subtitle}
                  </p>

                  <h2 className="mt-5 text-[44px] font-semibold leading-[0.95] tracking-[-0.06em] sm:text-[56px] lg:text-[68px]">
                    {slide.name}
                  </h2>

                  <div className="mt-8 flex items-center gap-3">
                    {slides.map(
                      (dot, dotIndex) => (
                        <span
                          key={dot.id}
                          className={[
                            "h-[4px] rounded-full transition-all duration-500",
                            dotIndex ===
                            currentIndex
                              ? "w-10 bg-current opacity-100"
                              : "w-4 bg-current opacity-35",
                          ].join(" ")}
                        />
                      ),
                    )}
                  </div>
                </div>

                <div className="relative flex min-w-[280px] flex-1 justify-center lg:justify-end">
                  <div className="absolute h-[420px] w-[420px] rounded-full bg-white/12 blur-3xl" />

                  <div
                    className={[
                      "relative transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isActive
                        ? "translate-y-0 scale-100 opacity-100"
                        : "translate-y-6 scale-[0.96] opacity-0",
                    ].join(" ")}
                  >
                    <Image
                      src={slide.image}
                      alt={slide.name}
                      width={420}
                      height={620}
                      priority
                      className="h-auto max-h-[68vh] w-auto object-contain drop-shadow-[0_28px_50px_rgba(0,0,0,0.28)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}

/* =========================================================
   BACKGROUND
========================================================= */

const COCA_WAVE_MAIN_PATH =
  "M -140 605 C 110 420, 305 700, 610 485 C 875 298, 1020 415, 1275 260 C 1490 130, 1640 165, 1920 20";

const COCA_WAVE_EDGE_PATH =
  "M -120 615 C 130 420, 315 700, 620 482 C 882 295, 1027 418, 1280 258 C 1492 125, 1648 164, 1910 25";

const COCA_WAVE_WHITE_PATH =
  "M -130 610 C 120 436, 325 682, 620 500 C 870 344, 1030 440, 1275 302 C 1490 181, 1640 196, 1900 83";

const RED_CARD_WAVE_PATH =
  "M -20 230 C 80 115, 165 285, 275 160 C 340 87, 395 100, 470 40";

function CocaBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-1/2 top-[-360px] h-[720px] w-[1150px] -translate-x-1/2 rounded-full bg-white blur-[110px]" />

      <div className="absolute -right-[260px] top-[80px] h-[580px] w-[580px] rounded-full bg-[#E41E2B]/[0.025] blur-[110px]" />

      <div className="absolute -left-[220px] bottom-[-160px] h-[460px] w-[460px] rounded-full bg-[#E41E2B]/[0.018] blur-[100px]" />

      <svg
        viewBox="0 0 1800 820"
        preserveAspectRatio="none"
        className="coca-wave coca-wave-main absolute -left-[9%] top-[6%] h-[72%] w-[118%]"
      >
        <defs>
          <linearGradient
            id="cocaRedGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop
              offset="0%"
              stopColor="#E41E2B"
              stopOpacity="0.015"
            />

            <stop
              offset="35%"
              stopColor="#E41E2B"
              stopOpacity="0.09"
            />

            <stop
              offset="72%"
              stopColor="#E41E2B"
              stopOpacity="0.055"
            />

            <stop
              offset="100%"
              stopColor="#E41E2B"
              stopOpacity="0.01"
            />
          </linearGradient>
        </defs>

        <path
          d={COCA_WAVE_MAIN_PATH}
          fill="none"
          stroke="url(#cocaRedGradient)"
          strokeWidth="118"
          strokeLinecap="round"
        />
      </svg>

      <svg
        viewBox="0 0 1800 820"
        preserveAspectRatio="none"
        className="coca-wave coca-wave-edge absolute -left-[7%] top-[7%] h-[72%] w-[116%]"
      >
        <path
          d={COCA_WAVE_EDGE_PATH}
          fill="none"
          stroke="rgba(228,30,43,0.17)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <svg
        viewBox="0 0 1800 820"
        preserveAspectRatio="none"
        className="coca-wave coca-wave-white absolute -left-[11%] top-[13%] h-[69%] w-[121%]"
      >
        <path
          d={COCA_WAVE_WHITE_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.82)"
          strokeWidth="34"
          strokeLinecap="round"
        />
      </svg>

      <div className="coca-particle coca-particle-1 absolute left-[9%] top-[25%] h-[5px] w-[5px] rounded-full bg-[#E41E2B]/20" />

      <div className="coca-particle coca-particle-2 absolute left-[20%] top-[72%] h-[8px] w-[8px] rounded-full border border-[#E41E2B]/15 bg-white/70" />

      <div className="coca-particle coca-particle-3 absolute right-[13%] top-[30%] h-[6px] w-[6px] rounded-full border border-[#E41E2B]/15" />

      <div className="coca-particle coca-particle-4 absolute right-[24%] top-[78%] h-[4px] w-[4px] rounded-full bg-[#E41E2B]/15" />

      <div className="coca-particle coca-particle-5 absolute left-[57%] top-[15%] h-[3px] w-[3px] rounded-full bg-[#E41E2B]/15" />

      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(20,23,26,0.12) 0.55px, transparent 0.55px)",
          backgroundSize:
            "22px 22px",
        }}
      />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,247,246,0.30)_0%,rgba(247,247,246,0.03)_32%,rgba(247,247,246,0.38)_100%)]" />

      <div className="absolute inset-y-0 left-0 w-[27%] bg-[linear-gradient(90deg,#F7F7F6_0%,rgba(247,247,246,0.72)_48%,transparent_100%)]" />
    </div>
  );
}

/* =========================================================
   MODULE CARD
========================================================= */

function ModuleCard({
  module,
  index,
  ready,
}: {
  module: ModuleCardData;
  index: number;
  ready: boolean;
}) {
  const isRed =
    module.variant === "red";

  const isDark =
    module.variant === "dark";

  const foreground =
    isRed || isDark;

  return (
    <Link
      href={module.href}
      className={[
        "module-card group relative flex min-h-[292px] overflow-hidden rounded-[30px] border p-7",
        "transition-[transform,opacity,box-shadow,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        ready
          ? "translate-y-0 opacity-100"
          : "translate-y-8 opacity-0",
        isRed
          ? "border-[#E41E2B] bg-[#E41E2B] text-white shadow-[0_22px_55px_rgba(228,30,43,0.16)] hover:-translate-y-[7px] hover:shadow-[0_34px_78px_rgba(228,30,43,0.25)]"
          : isDark
            ? "border-[#191C1F] bg-[#191C1F] text-white shadow-[0_22px_55px_rgba(18,20,22,0.11)] hover:-translate-y-[7px] hover:shadow-[0_34px_78px_rgba(18,20,22,0.20)]"
            : "border-black/[0.06] bg-white/[0.88] text-[#181B1F] backdrop-blur-md shadow-[0_14px_40px_rgba(18,20,22,0.035)] hover:-translate-y-[7px] hover:border-black/[0.10] hover:shadow-[0_28px_68px_rgba(18,20,22,0.085)]",
      ].join(" ")}
      style={{
        transitionDelay: `${100 + index * 65}ms`,
      }}
    >
      <div
        className={[
          "pointer-events-none absolute left-[-50%] top-[-60%] h-[130%] w-[58%] rotate-[18deg] opacity-0 blur-xl transition-all duration-700 group-hover:left-[95%] group-hover:opacity-100",
          foreground
            ? "bg-white/[0.08]"
            : "bg-white/80",
        ].join(" ")}
      />

      {isRed && (
        <>
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/[0.09] blur-3xl transition-transform duration-1000 group-hover:scale-125" />

          <svg
            viewBox="0 0 420 300"
            className="pointer-events-none absolute bottom-[-70px] right-[-120px] h-[240px] w-[350px] opacity-[0.12]"
          >
            <path
              d={RED_CARD_WAVE_PATH}
              fill="none"
              stroke="white"
              strokeWidth="40"
              strokeLinecap="round"
            />
          </svg>
        </>
      )}

      {isDark && (
        <>
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#E41E2B]/20 blur-3xl transition-transform duration-1000 group-hover:scale-125" />

          <div className="absolute bottom-[-110px] right-[8%] h-52 w-52 rounded-full bg-white/[0.035] blur-3xl" />

          <div className="absolute right-6 top-6 h-[5px] w-[5px] rounded-full bg-[#E41E2B] shadow-[0_0_18px_rgba(228,30,43,0.7)]" />
        </>
      )}

      <div className="relative flex w-full flex-col justify-between">
        <div>
          <div className="flex items-start justify-between">
            <div
              className={[
                "flex h-12 w-12 items-center justify-center rounded-[15px]",
                "transition-all duration-500 group-hover:-translate-y-1 group-hover:scale-[1.04]",
                foreground
                  ? "bg-white/[0.10] text-white"
                  : "border border-black/[0.035] bg-[#F6F6F5] text-[#34393E]",
              ].join(" ")}
            >
              {module.icon}
            </div>

            <ArrowRight
              size={16}
              strokeWidth={1.7}
              className={[
                "transition-all duration-300 group-hover:translate-x-1",
                foreground
                  ? "text-white/40 group-hover:text-white/90"
                  : "text-[#ADB1B5] group-hover:text-[#24282C]",
              ].join(" ")}
            />
          </div>

          <h2
            className={[
              "mt-9 text-[27px] font-semibold leading-[1.05] tracking-[-0.052em]",
              foreground
                ? "text-white"
                : "text-[#181B1F]",
            ].join(" ")}
          >
            {module.title}
          </h2>

          <p
            className={[
              "mt-4 max-w-[270px] text-[12px] leading-6",
              foreground
                ? "text-white/64"
                : "text-[#7A8187]",
            ].join(" ")}
          >
            {module.description}
          </p>
        </div>

        <div
          className={[
            "mt-9 flex items-center justify-between border-t pt-5",
            foreground
              ? "border-white/[0.11]"
              : "border-black/[0.055]",
          ].join(" ")}
        >
          <span
            className={[
              "text-[11px] font-semibold",
              foreground
                ? "text-white/92"
                : "text-[#32373B]",
            ].join(" ")}
          >
            {module.action}
          </span>

          <div
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 group-hover:translate-x-1",
              isRed
                ? "bg-white text-[#E41E2B]"
                : isDark
                  ? "bg-white text-[#191C1F]"
                  : "bg-[#F2F2F1] text-[#676D73] group-hover:bg-[#191C1F] group-hover:text-white",
            ].join(" ")}
          >
            <ArrowRight
              size={13}
              strokeWidth={2}
            />
          </div>
        </div>
      </div>
    </Link>
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
    getFirstName(user.name);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [ready, setReady] =
    useState(false);

  const [
    showEntryIntro,
    setShowEntryIntro,
  ] = useState(false);

  const [
    introDecisionMade,
    setIntroDecisionMade,
  ] = useState(false);

  useEffect(() => {
    const frame =
      window.requestAnimationFrame(() => {
        setReady(true);
      });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    const alreadyPlayed =
      window.sessionStorage.getItem(
        INTRO_STORAGE_KEY,
      ) === "true";

    if (
      !prefersReducedMotion &&
      !alreadyPlayed
    ) {
      setShowEntryIntro(true);
    }

    setIntroDecisionMade(true);
  }, []);

  const modules: ModuleCardData[] =
    useMemo(
      () => [
        {
          href: "/dashboard/importar",
          title:
            "Importar apontamentos",
          description:
            "Adicione uma nova planilha de manutenção ao histórico das unidades.",
          action: "Importar planilha",
          variant: "red",
          icon: (
            <FileSpreadsheet
              size={20}
              strokeWidth={1.7}
            />
          ),
        },

        {
          href: "/dashboard/historico",
          title: "Histórico",
          description:
            "Consulte falhas, ocorrências e paradas registradas na manutenção.",
          action: "Consultar",
          variant: "white",
          icon: (
            <History
              size={20}
              strokeWidth={1.7}
            />
          ),
        },

        {
          href: "/dashboard/confiabilidade",
          title: "Confiabilidade",
          description:
            "Identifique concentração de perdas, recorrência e impacto das falhas.",
          action: "Analisar",
          variant: "white",
          icon: (
            <Activity
              size={20}
              strokeWidth={1.7}
            />
          ),
        },

        {
          href: "/dashboard/masp",
          title: "MASP",
          description:
            "Investigue problemas, valide causas e acompanhe ações com dados locais.",
          action: "Abrir análises",
          variant: "white",
          icon: (
            <Waypoints
              size={20}
              strokeWidth={1.7}
            />
          ),
        },

        {
          href: "/dashboard/ursus",
          title: "Ursus",
          description:
            "Acompanhe a assertividade, versões e evolução do modelo de machine learning.",
          action: "Abrir modelo",
          variant: "dark",
          icon: (
            <PawPrint
              size={20}
              strokeWidth={1.7}
            />
          ),
        },
      ],
      [],
    );

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response = await fetch(
        "/api/auth/logout",
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          "Não foi possível encerrar a sessão.",
        );
      }

      window.location.href = "/login";
    } catch (error) {
      console.error(
        "Erro ao sair:",
        error,
      );

      setLoggingOut(false);
    }
  }

  function handleFinishIntro() {
    window.sessionStorage.setItem(
      INTRO_STORAGE_KEY,
      "true",
    );

    setShowEntryIntro(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F7F6]">
      {introDecisionMade &&
        showEntryIntro && (
          <ProductEntryIntro
            onFinish={handleFinishIntro}
          />
        )}

      <CocaBackground />

      <header className="relative z-40 border-b border-black/[0.045] bg-white/[0.88] shadow-[0_1px_0_rgba(0,0,0,0.01)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1320px] items-center justify-between gap-4 px-6 py-2 sm:px-8 lg:px-10">
          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={180}
            height={64}
            priority
            className="h-auto max-h-[40px] w-auto object-contain transition-transform duration-500 hover:scale-[1.025]"
          />

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <UnitFilter
              fallbackLabel={
                unit.city
              }
            />

            <div className="mx-1 hidden h-7 w-px bg-black/[0.06] lg:block" />

            <Link
              href="/dashboard/usuarios"
              className="group flex h-9 items-center gap-2 rounded-[11px] px-2.5 text-[11px] font-medium text-[#676D73] transition-all duration-200 hover:bg-[#F2F2F1] hover:text-[#23272B]"
            >
              <Users
                size={15}
                strokeWidth={1.8}
                className="transition-transform duration-300 group-hover:scale-[1.07]"
              />

              <span className="hidden xl:inline">
                Usuários
              </span>
            </Link>

            <div className="mx-1 hidden h-7 w-px bg-black/[0.06] md:block" />

            <div className="hidden min-w-0 text-right md:block">
              <p className="max-w-[145px] truncate text-[11px] font-semibold text-[#292D31]">
                {user.name}
              </p>

              <p className="mt-[1px] text-[9px] text-[#A1A5AA]">
                {unit.city || "Unidade"}
              </p>
            </div>

            <div className="mx-1 h-7 w-px bg-black/[0.06]" />

            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              disabled={loggingOut}
              className="group flex h-9 items-center gap-2 rounded-[11px] px-2.5 text-[11px] font-medium text-[#777D83] transition-all duration-200 hover:bg-[#FFF1F2] hover:text-[#E41E2B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LogOut
                size={15}
                strokeWidth={1.8}
                className="transition-transform duration-300 group-hover:translate-x-[2px]"
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

      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-6 pb-14 pt-11 sm:px-8 lg:px-10 lg:pt-14">
        <section
          className={[
            "relative transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
            ready
              ? "translate-y-0 opacity-100"
              : "translate-y-5 opacity-0",
          ].join(" ")}
        >
          <div className="max-w-[770px]">
            <h1 className="text-[42px] font-semibold leading-[0.98] tracking-[-0.065em] text-[#171A1D] sm:text-[52px] lg:text-[60px]">
              Manutenção orientada
              <br />
              por dados
              <span className="text-[#E41E2B]">
                .
              </span>
            </h1>

            <p className="mt-5 max-w-[600px] text-[13px] leading-6 text-[#777E85]">
              Olá, {firstName}. Importe novos apontamentos, consulte o histórico ou analise a confiabilidade das unidades selecionadas.
            </p>
          </div>
        </section>

        <section className="mt-11">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {modules.map(
              (
                module,
                index,
              ) => (
                <ModuleCard
                  key={module.href}
                  module={module}
                  index={index}
                  ready={ready}
                />
              ),
            )}
          </div>
        </section>

        <footer
          className={[
            "mt-7 flex items-center justify-between border-t border-black/[0.045] pt-4",
            "transition-all delay-500 duration-700",
            ready
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          ].join(" ")}
        >
          <p className="text-[8px] uppercase tracking-[0.14em] text-[#A5A9AD]">
            Coca-Cola FEMSA
          </p>

          <div className="flex items-center gap-2">
            <span className="h-[4px] w-[4px] rounded-full bg-[#E41E2B]" />

            <span className="text-[8px] uppercase tracking-[0.14em] text-[#A5A9AD]">
              Manutenção industrial
            </span>
          </div>
        </footer>
      </div>

      <style>
        {`
          @keyframes cocaWaveMain {
            0% {
              transform: translate3d(-1.4%, 0, 0) scaleX(1);
            }

            50% {
              transform: translate3d(1.5%, -1%, 0) scaleX(1.018);
            }

            100% {
              transform: translate3d(-1.4%, 0, 0) scaleX(1);
            }
          }

          @keyframes cocaWaveEdge {
            0% {
              transform: translate3d(1%, 0, 0);
            }

            50% {
              transform: translate3d(-1.3%, 1%, 0);
            }

            100% {
              transform: translate3d(1%, 0, 0);
            }
          }

          @keyframes cocaWaveWhite {
            0% {
              transform: translate3d(-0.7%, 0.8%, 0);
            }

            50% {
              transform: translate3d(1%, -0.6%, 0);
            }

            100% {
              transform: translate3d(-0.7%, 0.8%, 0);
            }
          }

          @keyframes cocaParticleOne {
            0%,
            100% {
              transform: translate3d(0, 0, 0);
            }

            50% {
              transform: translate3d(10px, -21px, 0);
            }
          }

          @keyframes cocaParticleTwo {
            0%,
            100% {
              transform: translate3d(0, 0, 0);
            }

            50% {
              transform: translate3d(-13px, -16px, 0);
            }
          }

          .coca-wave-main {
            animation: cocaWaveMain 17s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          }

          .coca-wave-edge {
            animation: cocaWaveEdge 20s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          }

          .coca-wave-white {
            animation: cocaWaveWhite 23s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          }

          .coca-particle-1,
          .coca-particle-3,
          .coca-particle-5 {
            animation: cocaParticleOne 9s ease-in-out infinite;
          }

          .coca-particle-2,
          .coca-particle-4 {
            animation: cocaParticleTwo 11s ease-in-out infinite;
          }

          .coca-particle-2 {
            animation-delay: -4s;
          }

          .coca-particle-3 {
            animation-delay: -6s;
          }

          .coca-particle-4 {
            animation-delay: -2s;
          }

          .coca-particle-5 {
            animation-delay: -7s;
          }

          @media (prefers-reduced-motion: reduce) {
            .coca-wave-main,
            .coca-wave-edge,
            .coca-wave-white,
            .coca-particle-1,
            .coca-particle-2,
            .coca-particle-3,
            .coca-particle-4,
            .coca-particle-5,
            .module-card {
              animation: none !important;
              transition: none !important;
            }
          }
        `}
      </style>
    </main>
  );
}