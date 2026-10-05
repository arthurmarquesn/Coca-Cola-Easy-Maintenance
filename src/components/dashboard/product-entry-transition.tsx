// FILE: src/components/dashboard/product-entry-transition.tsx

"use client";

import Image from "next/image";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

interface ProductEntryTransitionProps {
  onComplete: () => void;
}

interface ProductSlide {
  id: string;

  image: string;

  alt: string;

  background: string;

  imageClassName?: string;
}

/* =========================================================
   CONFIG
========================================================= */

const PLAY_TRIGGER_KEY =
  "play-dashboard-product-transition";

const SLIDE_DURATION_MS =
  720;

const FINAL_HOLD_MS =
  350;

const EXIT_DURATION_MS =
  750;

const PRODUCTS:
  ProductSlide[] =
  [
    {
      id:
        "coca-original",

      image:
        "/products/coca-original.png",

      alt:
        "Coca-Cola Original",

      background:
        "#F40018",

      imageClassName:
        "max-h-[74vh]",
    },

    {
      id:
        "coca-zero",

      image:
        "/products/coca-zero.png",

      alt:
        "Coca-Cola Sem Açúcar",

      background:
        "#171D21",

      imageClassName:
        "max-h-[74vh]",
    },

    {
      id:
        "powerade",

      image:
        "/products/powerade.png",

      alt:
        "Powerade",

      background:
        "#18C8EB",

      imageClassName:
        "max-h-[72vh]",
    },

    {
      id:
        "schweppes",

      image:
        "/products/schweppes.png",

      alt:
        "Schweppes",

      background:
        "#F5C900",

      imageClassName:
        "max-h-[69vh]",
    },

    {
      id:
        "monster",

      image:
        "/products/monster.png",

      alt:
        "Monster Energy",

      background:
        "#8CCB00",

      imageClassName:
        "max-h-[69vh]",
    },
  ];

/* =========================================================
   COMPONENT
========================================================= */

export function ProductEntryTransition({
  onComplete,
}: ProductEntryTransitionProps) {
  const [
    activeIndex,
    setActiveIndex,
  ] =
    useState(
      0,
    );

  const [
    visible,
    setVisible,
  ] =
    useState(
      false,
    );

  const [
    exiting,
    setExiting,
  ] =
    useState(
      false,
    );

  const [
    initialized,
    setInitialized,
  ] =
    useState(
      false,
    );

  const timersRef =
    useRef<
      number[]
    >(
      [],
    );

  /* =======================================================
     TIMERS
  ======================================================= */

  const clearTimers =
    useCallback(
      () => {
        for (
          const timer
          of timersRef.current
        ) {
          window.clearTimeout(
            timer,
          );
        }

        timersRef.current =
          [];
      },
      [],
    );

  /* =======================================================
     FINISH
  ======================================================= */

  const finish =
    useCallback(
      () => {
        clearTimers();

        setVisible(
          false,
        );

        onComplete();
      },
      [
        clearTimers,
        onComplete,
      ],
    );

  /* =======================================================
     DETERMINE IF TRANSITION MUST PLAY
  ======================================================= */

  useEffect(
    () => {
      let shouldPlay =
        false;

      try {
        shouldPlay =
          window
            .sessionStorage
            .getItem(
              PLAY_TRIGGER_KEY,
            ) ===
          "true";

        /*
         * Consume imediatamente.
         *
         * Assim a animação não reaparece ao
         * atualizar ou voltar para /dashboard.
         */
        window
          .sessionStorage
          .removeItem(
            PLAY_TRIGGER_KEY,
          );
      } catch {
        shouldPlay =
          false;
      }

      const reduceMotion =
        window
          .matchMedia(
            "(prefers-reduced-motion: reduce)",
          )
          .matches;

      if (
        !shouldPlay ||
        reduceMotion
      ) {
        setInitialized(
          true,
        );

        onComplete();

        return;
      }

      setVisible(
        true,
      );

      setInitialized(
        true,
      );
    },
    [
      onComplete,
    ],
  );

  /* =======================================================
     TIMELINE
  ======================================================= */

  useEffect(
    () => {
      if (
        !initialized ||
        !visible
      ) {
        return;
      }

      clearTimers();

      for (
        let index = 1;
        index <
        PRODUCTS.length;
        index += 1
      ) {
        const timer =
          window.setTimeout(
            () => {
              setActiveIndex(
                index,
              );
            },
            index *
              SLIDE_DURATION_MS,
          );

        timersRef.current.push(
          timer,
        );
      }

      const exitAt =
        PRODUCTS.length *
          SLIDE_DURATION_MS +
        FINAL_HOLD_MS;

      const exitTimer =
        window.setTimeout(
          () => {
            setExiting(
              true,
            );
          },
          exitAt,
        );

      timersRef.current.push(
        exitTimer,
      );

      const finishTimer =
        window.setTimeout(
          () => {
            finish();
          },
          exitAt +
            EXIT_DURATION_MS,
        );

      timersRef.current.push(
        finishTimer,
      );

      return () => {
        clearTimers();
      };
    },
    [
      clearTimers,
      finish,
      initialized,
      visible,
    ],
  );

  /* =======================================================
     LOCK PAGE
  ======================================================= */

  useEffect(
    () => {
      if (
        !visible
      ) {
        return;
      }

      const previous =
        document
          .body
          .style
          .overflow;

      document
        .body
        .style
        .overflow =
        "hidden";

      return () => {
        document
          .body
          .style
          .overflow =
          previous;
      };
    },
    [
      visible,
    ],
  );

  /* =======================================================
     SKIP
  ======================================================= */

  function handleSkip() {
    clearTimers();

    setExiting(
      true,
    );

    const timer =
      window.setTimeout(
        () => {
          finish();
        },
        450,
      );

    timersRef.current.push(
      timer,
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  if (
    !initialized ||
    !visible
  ) {
    return null;
  }

  return (
    <div
      className={[
        "fixed",
        "inset-0",
        "z-[9999]",
        "overflow-hidden",

        "transition-[opacity,transform,clip-path]",
        "duration-[750ms]",
        "ease-[cubic-bezier(0.76,0,0.24,1)]",

        exiting
          ? [
              "pointer-events-none",
              "scale-[1.02]",
              "opacity-0",
              "[clip-path:inset(0_0_100%_0)]",
            ].join(
              " ",
            )
          : [
              "scale-100",
              "opacity-100",
              "[clip-path:inset(0_0_0_0)]",
            ].join(
              " ",
            ),
      ].join(
        " ",
      )}
    >
      {/* =================================================
          PRODUCT SCREENS
      ================================================== */}

      {PRODUCTS.map(
        (
          product,
          index,
        ) => {
          const isActive =
            index ===
            activeIndex;

          const isPast =
            index <
            activeIndex;

          return (
            <section
              key={
                product.id
              }
              aria-hidden={
                !isActive
              }
              className={[
                "absolute",
                "inset-0",

                "transition-transform",
                "duration-[720ms]",
                "ease-[cubic-bezier(0.76,0,0.24,1)]",

                isActive
                  ? "translate-x-0"
                  : isPast
                    ? "-translate-x-full"
                    : "translate-x-full",
              ].join(
                " ",
              )}
              style={{
                backgroundColor:
                  product.background,

                zIndex:
                  index +
                  1,
              }}
            >
              {/* =========================================
                  BACKGROUND DETAILS
              ========================================== */}

              <div className="absolute left-1/2 top-1/2 h-[68vh] w-[68vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.08] blur-[90px]" />

              <div className="absolute -left-[10%] top-[18%] h-[38vh] w-[38vh] rounded-full border border-white/[0.08]" />

              <div className="absolute -right-[8%] bottom-[10%] h-[48vh] w-[48vh] rounded-full border border-white/[0.06]" />

              {/* =========================================
                  PRODUCT IMAGE
              ========================================== */}

              <div className="relative flex h-full w-full items-center justify-center px-8">
                <div
                  className={[
                    "relative",

                    "transition-[transform,opacity]",
                    "duration-[760ms]",
                    "ease-[cubic-bezier(0.16,1,0.3,1)]",

                    isActive
                      ? [
                          "translate-y-0",
                          "scale-100",
                          "opacity-100",
                        ].join(
                          " ",
                        )
                      : [
                          "translate-y-9",
                          "scale-[0.91]",
                          "opacity-0",
                        ].join(
                          " ",
                        ),
                  ].join(
                    " ",
                  )}
                >
                  <div className="absolute bottom-[2%] left-1/2 h-[6%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-xl" />

                  <Image
                    src={
                      product.image
                    }
                    alt={
                      product.alt
                    }
                    width={
                      500
                    }
                    height={
                      760
                    }
                    priority
                    draggable={
                      false
                    }
                    className={[
                      "relative",
                      "h-auto",
                      "w-auto",
                      "select-none",
                      "object-contain",
                      "drop-shadow-[0_38px_48px_rgba(0,0,0,0.30)]",

                      product
                        .imageClassName ??
                        "",
                    ].join(
                      " ",
                    )}
                  />
                </div>
              </div>

              {/* =========================================
                  LARGE INDEX
              ========================================== */}

              <div className="absolute bottom-8 left-9 hidden sm:block">
                <p className="text-[9px] font-medium tracking-[0.18em] text-white/40 mix-blend-difference">
                  0
                  {
                    index +
                    1
                  }
                </p>
              </div>
            </section>
          );
        },
      )}

      {/* =================================================
          LOGO
      ================================================== */}

      <div className="pointer-events-none absolute left-1/2 top-8 z-[100] -translate-x-1/2">
        <Image
          src="/logo.webp"
          alt=""
          width={155}
          height={60}
          priority
          className="h-auto max-h-[38px] w-auto object-contain brightness-0 invert opacity-95 mix-blend-difference"
        />
      </div>

      {/* =================================================
          SKIP
      ================================================== */}

      <button
        type="button"
        onClick={
          handleSkip
        }
        className="absolute right-8 top-8 z-[110] rounded-full border border-white/20 bg-black/[0.08] px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-white/75 backdrop-blur-md transition-colors duration-200 hover:bg-black/20 hover:text-white"
      >
        Pular
      </button>

      {/* =================================================
          PROGRESS
      ================================================== */}

      <div className="absolute bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2">
        {PRODUCTS.map(
          (
            item,
            index,
          ) => (
            <div
              key={
                item.id
              }
              className={[
                "h-[3px]",
                "rounded-full",
                "bg-white",

                "transition-all",
                "duration-500",

                index ===
                activeIndex
                  ? "w-10 opacity-90"
                  : index <
                      activeIndex
                    ? "w-4 opacity-50"
                    : "w-4 opacity-25",
              ].join(
                " ",
              )}
            />
          ),
        )}
      </div>

      {/* =================================================
          GRAIN
      ================================================== */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[90] opacity-[0.045] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.95) 0.5px, transparent 0.5px)",

          backgroundSize:
            "7px 7px",
        }}
      />
    </div>
  );
}