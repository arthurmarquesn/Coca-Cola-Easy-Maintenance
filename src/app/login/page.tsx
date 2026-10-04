"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";

const CURVE_PATH =
  "M205 0 H118 C72 82 160 171 102 262 C38 361 28 449 112 526 C169 579 94 672 70 748 C44 830 148 901 102 1000 H205 Z";

const WAVE_PATH_1 =
  "M0 105 C135 195 285 64 430 112 C575 160 705 217 850 112 V270 H0 Z";

const WAVE_PATH_2 =
  "M0 174 C155 240 308 116 465 157 C615 197 725 240 850 170 V270 H0 Z";

const LOGIN_TRANSITION_DURATION =
  1800;

const DASHBOARD_PRODUCT_TRANSITION_KEY =
  "play-dashboard-product-transition";

interface LoginResponse {
  success: boolean;
  message?: string;
}

export default function LoginPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    remember,
    setRemember,
  ] =
    useState(false);

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    isLeaving,
    setIsLeaving,
  ] =
    useState(false);

  const [
    isHydrated,
    setIsHydrated,
  ] =
    useState(false);

  useEffect(
    () => {
      setIsHydrated(
        true,
      );

      router.prefetch(
        "/dashboard",
      );
    },
    [
      router,
    ],
  );

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      loading ||
      isLeaving
    ) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/auth/login",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                password,
                remember,
              }),
          },
        );

      const data =
        (
          await response
            .json()
            .catch(
              () =>
                null,
            )
        ) as
          | LoginResponse
          | null;

      if (
        !response.ok ||
        !data?.success
      ) {
        setError(
          data?.message ??
            "Não foi possível realizar o login.",
        );

        setLoading(
          false,
        );

        return;
      }

      /*
       * Marca que o próximo acesso ao dashboard
       * veio de um login bem-sucedido.
       *
       * A home irá consumir e remover esta flag
       * antes de executar a animação dos produtos.
       */
      try {
        window
          .sessionStorage
          .setItem(
            DASHBOARD_PRODUCT_TRANSITION_KEY,
            "true",
          );
      } catch {
        /*
         * Não bloqueia o login caso
         * sessionStorage esteja indisponível.
         */
      }

      setIsLeaving(
        true,
      );

      await new Promise<void>(
        (
          resolve,
        ) => {
          window.setTimeout(
            resolve,
            LOGIN_TRANSITION_DURATION,
          );
        },
      );

      router.replace(
        "/dashboard",
      );
    } catch {
      setError(
        "Não foi possível conectar ao servidor.",
      );

      setLoading(
        false,
      );
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* =========================================================
          TRANSIÇÃO DE SAÍDA
      ========================================================== */}

      <div
        className={
          isLeaving
            ? "login-transition login-transition-active"
            : "login-transition"
        }
        aria-hidden="true"
      >
        <div className="login-transition-glow" />

        <div className="login-transition-content">
          <Image
            src="/logo.webp"
            alt=""
            width={240}
            height={110}
            className="h-auto w-[190px] object-contain brightness-0 invert"
          />
        </div>
      </div>

      {/* =========================================================
          PÁGINA
      ========================================================== */}

      <div
        className={
          isLeaving
            ? "login-page login-page-leaving"
            : "login-page"
        }
      >
        <div className="grid min-h-screen w-full lg:grid-cols-[46%_54%]">
          {/* =====================================================
              PAINEL INSTITUCIONAL
          ====================================================== */}

          <section className="login-brand-panel relative hidden min-h-screen overflow-hidden bg-[#F40009] lg:flex lg:items-center">
            <svg
              className="pointer-events-none absolute -right-[2px] top-0 h-full w-[185px] xl:w-[205px]"
              viewBox="0 0 205 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={
                  CURVE_PATH
                }
                fill="#ffffff"
              />
            </svg>

            <div className="pointer-events-none absolute bottom-0 left-0 h-[240px] w-full opacity-[0.09] xl:h-[270px]">
              <svg
                viewBox="0 0 850 270"
                preserveAspectRatio="none"
                className="h-full w-full"
                aria-hidden="true"
              >
                <path
                  d={
                    WAVE_PATH_1
                  }
                  fill="#ffffff"
                />

                <path
                  d={
                    WAVE_PATH_2
                  }
                  fill="#ffffff"
                  opacity="0.52"
                />
              </svg>
            </div>

            <div className="login-brand-content relative z-10 w-full px-14 pr-32 xl:px-[5.5rem] xl:pr-40 2xl:px-28 2xl:pr-48">
              <div className="max-w-[580px]">
                <h1 className="typing-title text-[48px] font-semibold leading-[1.04] tracking-[-0.05em] text-white xl:text-[58px] 2xl:text-[68px]">
                  O futuro é nosso.
                </h1>
              </div>

              <div className="my-8 h-[3px] w-16 rounded-full bg-white" />

              <p className="max-w-[470px] text-[17px] font-medium leading-8 text-white/95 xl:text-[18px]">
                Dados que apoiam uma operação mais eficiente.
              </p>

              <p className="mt-3 max-w-[440px] text-[14px] leading-7 text-white/70 xl:text-[15px]">
                Informação para apoiar análises, decisões e a melhoria contínua
                dos processos de manutenção.
              </p>
            </div>
          </section>

          {/* =====================================================
              LOGIN
          ====================================================== */}

          <section className="relative flex min-h-screen items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
            <div className="absolute left-0 top-0 h-1 w-full bg-[#F40009] lg:hidden" />

            <div className="login-form-container w-full max-w-[410px]">
              {/* Logo */}

              <div className="login-logo mb-12 flex justify-center">
                <Image
                  src="/logo.webp"
                  alt="Coca-Cola FEMSA"
                  width={260}
                  height={120}
                  priority
                  className="h-auto max-h-[105px] w-auto max-w-[210px] object-contain sm:max-w-[225px]"
                />
              </div>

              {/* Cabeçalho */}

              <header className="login-header mb-9 text-center">
                <h2 className="text-[30px] font-semibold tracking-[-0.04em] text-[#191919] sm:text-[32px]">
                  Acesse sua conta
                </h2>

                <p className="mx-auto mt-3 max-w-[340px] text-[13px] leading-6 text-[#7C8087] sm:text-sm">
                  Informe suas credenciais corporativas para continuar.
                </p>
              </header>

              {/* Formulário */}

              <form
                onSubmit={
                  handleSubmit
                }
                inert={
                  !isHydrated
                }
                className="login-form space-y-5"
              >
                {/* E-mail */}

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-[13px] font-semibold text-[#323438]"
                  >
                    E-mail corporativo
                  </label>

                  <div className="group relative">
                    <Mail
                      size={18}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#A0A5AC] transition-colors duration-200 group-focus-within:text-[#F40009]"
                    />

                    <input
                      id="email"
                      type="email"
                      value={
                        email
                      }
                      onChange={(
                        event,
                      ) =>
                        setEmail(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="Digite seu e-mail"
                      autoComplete="email"
                      required
                      disabled={
                        loading ||
                        isLeaving
                      }
                      className="login-input h-[54px] w-full rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] pl-12 pr-4 text-[14px] text-[#232529] outline-none transition-all duration-200 placeholder:text-[#A8ADB4] hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                </div>

                {/* Senha */}

                <div>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <label
                      htmlFor="password"
                      className="text-[13px] font-semibold text-[#323438]"
                    >
                      Senha
                    </label>

                    <button
                      type="button"
                      disabled={
                        loading ||
                        isLeaving
                      }
                      className="text-[12px] font-medium text-[#6F747B] transition-colors duration-200 hover:text-[#F40009] focus-visible:outline-none focus-visible:text-[#F40009] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  <div className="group relative">
                    <LockKeyhole
                      size={18}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#A0A5AC] transition-colors duration-200 group-focus-within:text-[#F40009]"
                    />

                    <input
                      id="password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={
                        password
                      }
                      onChange={(
                        event,
                      ) =>
                        setPassword(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="Digite sua senha"
                      autoComplete="current-password"
                      required
                      disabled={
                        loading ||
                        isLeaving
                      }
                      className="login-input h-[54px] w-full rounded-[11px] border border-[#DEE1E5] bg-[#F7F8FA] pl-12 pr-12 text-[14px] text-[#232529] outline-none transition-all duration-200 placeholder:text-[#A8ADB4] hover:border-[#CBCFD4] focus:border-[#F40009] focus:bg-white focus:ring-[3px] focus:ring-[rgba(244,0,9,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                    />

                    <button
                      type="button"
                      disabled={
                        loading ||
                        isLeaving
                      }
                      onClick={() =>
                        setShowPassword(
                          (
                            current,
                          ) =>
                            !current,
                        )
                      }
                      className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#A0A5AC] transition-colors duration-200 hover:text-[#555A60] focus-visible:outline-none focus-visible:text-[#F40009] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={
                        showPassword
                          ? "Ocultar senha"
                          : "Mostrar senha"
                      }
                    >
                      {showPassword ? (
                        <EyeOff
                          size={18}
                          strokeWidth={1.8}
                        />
                      ) : (
                        <Eye
                          size={18}
                          strokeWidth={1.8}
                        />
                      )}
                    </button>
                  </div>
                </div>

                {/* Manter conectado */}

                <div className="flex items-center gap-2.5 pt-0.5">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={
                      remember
                    }
                    onChange={(
                      event,
                    ) =>
                      setRemember(
                        event
                          .target
                          .checked,
                      )
                    }
                    disabled={
                      loading ||
                      isLeaving
                    }
                    className="h-[15px] w-[15px] cursor-pointer rounded border-[#CACED4] accent-[#F40009] disabled:cursor-not-allowed"
                  />

                  <label
                    htmlFor="remember"
                    className="cursor-pointer select-none text-[12px] text-[#666B72]"
                  >
                    Manter conectado
                  </label>
                </div>

                {/* Erro */}

                {error && (
                  <div
                    role="alert"
                    className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-5 text-red-700"
                  >
                    {
                      error
                    }
                  </div>
                )}

                {/* Botão */}

                <button
                  type="submit"
                  disabled={
                    loading ||
                    isLeaving
                  }
                  className="group flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[11px] bg-[#F40009] text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(244,0,9,0.16)] transition-all duration-200 hover:bg-[#DE0008] hover:shadow-[0_10px_24px_rgba(244,0,9,0.20)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(244,0,9,0.18)] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-75 disabled:hover:bg-[#F40009]"
                >
                  {loading ? (
                    <>
                      <LoaderCircle
                        size={17}
                        strokeWidth={2}
                        className="animate-spin"
                      />

                      <span>
                        Entrando...
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        Entrar
                      </span>

                      <ArrowRight
                        size={17}
                        strokeWidth={1.9}
                        className="transition-transform duration-200 group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>
              </form>

              {/* Rodapé */}

              <footer className="login-footer mt-9 border-t border-[#E9EBEE] pt-6 text-center">
                <p className="text-[10px] leading-5 tracking-[0.01em] text-[#979CA3] sm:text-[11px]">
                  Uso interno • Acesso restrito a usuários autorizados
                </p>
              </footer>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}