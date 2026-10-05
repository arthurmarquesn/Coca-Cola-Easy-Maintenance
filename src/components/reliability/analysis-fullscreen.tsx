"use client";

import {
  ArrowLeftRight,
  Columns2,
  Maximize2,
  Minimize2,
  Rows3,
  X,
} from "lucide-react";

import {
  type ReactNode,
  useEffect,
} from "react";

export type AnalysisLayout =
  | "SIDE_BY_SIDE"
  | "STACKED";

export type AnalysisOrder =
  | "PARETO_FIRST"
  | "JACK_KNIFE_FIRST";

export type AnalysisFocus =
  | "BOTH"
  | "PARETO"
  | "JACK_KNIFE";

interface AnalysisFullscreenProps {
  open: boolean;

  layout: AnalysisLayout;

  order: AnalysisOrder;

  focus: AnalysisFocus;

  pareto: ReactNode;

  jackKnife: ReactNode;

  onLayoutChange: (
    layout: AnalysisLayout,
  ) => void;

  onOrderChange: (
    order: AnalysisOrder,
  ) => void;

  onFocusChange: (
    focus: AnalysisFocus,
  ) => void;

  onClose: () => void;
}

interface AnalysisPanelProps {
  title: string;

  active: boolean;

  children: ReactNode;

  onFocus: () => void;

  onShowBoth: () => void;
}

function AnalysisPanel({
  title,
  active,
  children,
  onFocus,
  onShowBoth,
}: AnalysisPanelProps) {
  return (
    <section
      className="
        flex
        min-h-0
        flex-col
        overflow-hidden
        rounded-[24px]
        border
        border-black/[0.05]
        bg-white
        shadow-[0_14px_34px_rgba(28,31,34,0.04)]
      "
    >
      <div
        className="
          flex
          shrink-0
          items-center
          justify-between
          gap-4
          border-b
          border-black/[0.05]
          px-5
          py-3.5
        "
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="
              h-2
              w-2
              shrink-0
              rounded-full
              bg-[#E41E2B]
            "
          />

          <h2
            className="
              truncate
              text-[14px]
              font-semibold
              tracking-[-0.03em]
              text-[#202327]
            "
          >
            {title}
          </h2>
        </div>

        <button
          type="button"
          onClick={
            active
              ? onShowBoth
              : onFocus
          }
          className="
            inline-flex
            h-8
            shrink-0
            items-center
            gap-2
            rounded-[10px]
            border
            border-black/[0.06]
            bg-[#FAFAF9]
            px-3
            text-[10px]
            font-semibold
            text-[#686D73]
            transition
            hover:bg-[#F1F1F0]
            hover:text-[#202327]
          "
        >
          {active ? (
            <>
              <Minimize2
                size={12}
              />

              Ambos
            </>
          ) : (
            <>
              <Maximize2
                size={12}
              />

              Focar
            </>
          )}
        </button>
      </div>

      <div
        className="
          min-h-0
          flex-1
          overflow-auto
          p-4
          sm:p-5
        "
      >
        {children}
      </div>
    </section>
  );
}

export function AnalysisFullscreen({
  open,
  layout,
  order,
  focus,
  pareto,
  jackKnife,
  onLayoutChange,
  onOrderChange,
  onFocusChange,
  onClose,
}: AnalysisFullscreenProps) {
  useEffect(
    () => {
      if (!open) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style
        .overflow =
        "hidden";

      function handleKeyDown(
        event: KeyboardEvent,
      ) {
        if (
          event.key ===
          "Escape"
        ) {
          onClose();
        }
      }

      window.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        document.body.style
          .overflow =
          previousOverflow;

        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      open,
      onClose,
    ],
  );

  if (!open) {
    return null;
  }

  const paretoPanel = (
    <AnalysisPanel
      title="Pareto"
      active={
        focus ===
        "PARETO"
      }
      onFocus={() =>
        onFocusChange(
          "PARETO",
        )
      }
      onShowBoth={() =>
        onFocusChange(
          "BOTH",
        )
      }
    >
      {pareto}
    </AnalysisPanel>
  );

  const jackKnifePanel = (
    <AnalysisPanel
      title="Jack-Knife"
      active={
        focus ===
        "JACK_KNIFE"
      }
      onFocus={() =>
        onFocusChange(
          "JACK_KNIFE",
        )
      }
      onShowBoth={() =>
        onFocusChange(
          "BOTH",
        )
      }
    >
      {jackKnife}
    </AnalysisPanel>
  );

  const orderedPanels =
    order ===
    "PARETO_FIRST"
      ? [
          paretoPanel,
          jackKnifePanel,
        ]
      : [
          jackKnifePanel,
          paretoPanel,
        ];

  return (
    <div
      className="
        fixed
        inset-0
        z-[100]
        flex
        flex-col
        bg-[#F7F7F6]
      "
      role="dialog"
      aria-modal="true"
      aria-label="Análise expandida"
    >
      <header
        className="
          relative
          z-10
          shrink-0
          border-b
          border-black/[0.055]
          bg-white
        "
      >
        <div
          className="
            flex
            min-h-[68px]
            flex-col
            gap-3
            px-5
            py-3.5
            lg:flex-row
            lg:items-center
            lg:justify-between
            lg:px-6
          "
        >
          <div className="flex items-center gap-3">
            <span
              className="
                h-2
                w-2
                rounded-full
                bg-[#E41E2B]
              "
            />

            <h1
              className="
                text-[15px]
                font-semibold
                tracking-[-0.03em]
                text-[#202327]
              "
            >
              Análise expandida
            </h1>
          </div>

          <div
            className="
              flex
              flex-wrap
              items-center
              gap-2
            "
          >
            <div
              className="
                inline-flex
                rounded-[12px]
                bg-[#F1F1F0]
                p-1
              "
            >
              <button
                type="button"
                onClick={() =>
                  onFocusChange(
                    "BOTH",
                  )
                }
                className={
                  `
                    h-8
                    rounded-[9px]
                    px-3
                    text-[10px]
                    font-semibold
                    transition
                    ${
                      focus ===
                      "BOTH"
                        ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.12)]"
                        : "text-[#7F848A] hover:bg-white hover:text-[#34383D]"
                    }
                  `
                }
              >
                Ambos
              </button>

              <button
                type="button"
                onClick={() =>
                  onFocusChange(
                    "PARETO",
                  )
                }
                className={
                  `
                    h-8
                    rounded-[9px]
                    px-3
                    text-[10px]
                    font-semibold
                    transition
                    ${
                      focus ===
                      "PARETO"
                        ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.12)]"
                        : "text-[#7F848A] hover:bg-white hover:text-[#34383D]"
                    }
                  `
                }
              >
                Pareto
              </button>

              <button
                type="button"
                onClick={() =>
                  onFocusChange(
                    "JACK_KNIFE",
                  )
                }
                className={
                  `
                    h-8
                    rounded-[9px]
                    px-3
                    text-[10px]
                    font-semibold
                    transition
                    ${
                      focus ===
                      "JACK_KNIFE"
                        ? "bg-[#202327] text-white shadow-[0_4px_12px_rgba(32,35,39,0.12)]"
                        : "text-[#7F848A] hover:bg-white hover:text-[#34383D]"
                    }
                  `
                }
              >
                Jack-Knife
              </button>
            </div>

            <div
              className="
                inline-flex
                rounded-[12px]
                border
                border-black/[0.055]
                bg-white
                p-1
              "
            >
              <button
                type="button"
                disabled={
                  focus !==
                  "BOTH"
                }
                onClick={() =>
                  onLayoutChange(
                    "SIDE_BY_SIDE",
                  )
                }
                title="Lado a lado"
                aria-label="Usar layout lado a lado"
                className={
                  `
                    flex
                    h-8
                    w-9
                    items-center
                    justify-center
                    rounded-[9px]
                    transition
                    disabled:cursor-not-allowed
                    disabled:opacity-30
                    ${
                      focus ===
                        "BOTH" &&
                      layout ===
                        "SIDE_BY_SIDE"
                        ? "bg-[#FFF0F1] text-[#E41E2B]"
                        : "text-[#7D8288] hover:bg-[#F5F5F4] hover:text-[#202327]"
                    }
                  `
                }
              >
                <Columns2
                  size={14}
                />
              </button>

              <button
                type="button"
                disabled={
                  focus !==
                  "BOTH"
                }
                onClick={() =>
                  onLayoutChange(
                    "STACKED",
                  )
                }
                title="Um abaixo do outro"
                aria-label="Usar layout vertical"
                className={
                  `
                    flex
                    h-8
                    w-9
                    items-center
                    justify-center
                    rounded-[9px]
                    transition
                    disabled:cursor-not-allowed
                    disabled:opacity-30
                    ${
                      focus ===
                        "BOTH" &&
                      layout ===
                        "STACKED"
                        ? "bg-[#FFF0F1] text-[#E41E2B]"
                        : "text-[#7D8288] hover:bg-[#F5F5F4] hover:text-[#202327]"
                    }
                  `
                }
              >
                <Rows3
                  size={14}
                />
              </button>
            </div>

            <button
              type="button"
              disabled={
                focus !==
                "BOTH"
              }
              onClick={() =>
                onOrderChange(
                  order ===
                    "PARETO_FIRST"
                    ? "JACK_KNIFE_FIRST"
                    : "PARETO_FIRST",
                )
              }
              className="
                inline-flex
                h-10
                items-center
                gap-2
                rounded-[11px]
                border
                border-black/[0.055]
                bg-white
                px-3
                text-[10px]
                font-semibold
                text-[#6E7379]
                transition
                hover:bg-[#F5F5F4]
                hover:text-[#202327]
                disabled:cursor-not-allowed
                disabled:opacity-30
              "
            >
              <ArrowLeftRight
                size={13}
              />

              Inverter
            </button>

            <button
              type="button"
              onClick={
                onClose
              }
              title="Fechar"
              aria-label="Fechar análise expandida"
              className="
                ml-1
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-[11px]
                bg-[#202327]
                text-white
                transition
                hover:bg-[#34383D]
              "
            >
              <X
                size={16}
              />
            </button>
          </div>
        </div>

        <div
          className="
            h-[2px]
            w-full
            bg-gradient-to-r
            from-[#E41E2B]
            via-[#E41E2B]/30
            to-transparent
          "
        />
      </header>

      <div
        className="
          min-h-0
          flex-1
          overflow-auto
          p-4
          sm:p-5
          lg:p-6
        "
      >
        {focus ===
        "PARETO" ? (
          <div className="h-full min-h-[650px]">
            {paretoPanel}
          </div>
        ) : focus ===
          "JACK_KNIFE" ? (
          <div className="h-full min-h-[650px]">
            {jackKnifePanel}
          </div>
        ) : layout ===
          "SIDE_BY_SIDE" ? (
          <div
            className="
              grid
              min-h-full
              gap-4
              xl:h-full
              xl:grid-cols-2
            "
          >
            {orderedPanels.map(
              (
                panel,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  className="
                    min-h-[620px]
                    xl:min-h-0
                  "
                >
                  {panel}
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {orderedPanels.map(
              (
                panel,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  className="
                    min-h-[680px]
                  "
                >
                  {panel}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}