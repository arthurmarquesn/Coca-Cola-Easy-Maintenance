"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";

import {
  BOTTLE_OUTLINE_PATH,
  BOTTLE_OUTLINE_VIEWBOX,
} from "@/components/brand/bottle-outline";
import { BRAND_CURVE_PATH } from "@/components/brand/brand-curve";

import {
  MOTION_TIMELINE,
  REDUCED_MOTION_TIMELINE,
  type SceneElement,
  type Timeline,
  type Track,
} from "./login-transition-timeline";

/* Imagem PNG/WebP com fundo transparente, em /public. */
export const LOGIN_TRANSITION_BOTTLE_SRC =
  "/images/coca-cola-bottle.png";

/* =========================================================
   CONTEXTO

   O overlay vive no layout raiz para sobreviver à troca de
   rota: cobre o login, navega com a tela já vermelha e só
   revela quando o destino terminou de renderizar.
========================================================= */

type StartLoginTransition = (href: string) => void;

const LoginTransitionContext =
  createContext<StartLoginTransition | null>(null);

export function useLoginTransition(): StartLoginTransition {
  const start = useContext(
    LoginTransitionContext,
  );

  if (!start) {
    throw new Error(
      "useLoginTransition precisa estar dentro de LoginTransitionProvider.",
    );
  }

  return start;
}

export function LoginTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  const [href, setHref] =
    useState<string | null>(null);

  const [hasNavigated, setHasNavigated] =
    useState(false);

  const [isNavigating, startNavigation] =
    useTransition();

  function start(target: string) {
    setHref(
      (current) => current ?? target,
    );
  }

  function handleCovered() {
    if (!href) {
      return;
    }

    setHasNavigated(true);

    startNavigation(() => {
      router.replace(href);
    });
  }

  function handleFinished() {
    setHref(null);
    setHasNavigated(false);
  }

  return (
    <LoginTransitionContext value={start}>
      {children}

      {href && (
        <LoginTransitionOverlay
          canReveal={
            hasNavigated &&
            !isNavigating
          }
          onCovered={handleCovered}
          onFinished={handleFinished}
        />
      )}
    </LoginTransitionContext>
  );
}

/* =========================================================
   OVERLAY
========================================================= */

interface LoginTransitionOverlayProps {
  canReveal: boolean;
  onCovered: () => void;
  onFinished: () => void;
}

type Scene = Record<
  SceneElement,
  Element
>;

function getTimeline(): Timeline {
  return window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
    ? REDUCED_MOTION_TIMELINE
    : MOTION_TIMELINE;
}

function playTracks(
  scene: Scene,
  tracks: Track[],
): Animation[] {
  return tracks.map(
    ({ target, keyframes, timing }) =>
      scene[target].animate(keyframes, {
        fill: "both",
        ...timing,
      }),
  );
}

function whenFinished(
  animations: Animation[],
): Promise<unknown> {
  return Promise.all(
    animations.map(
      (animation) => animation.finished,
    ),
  );
}

function cancelAll(
  animations: Animation[],
) {
  animations.forEach((animation) =>
    animation.cancel(),
  );
}

/* Animações canceladas no cleanup rejeitam `finished`. */
function ignoreCancel() {}

function LoginTransitionOverlay({
  canReveal,
  onCovered,
  onFinished,
}: LoginTransitionOverlayProps) {
  const curtainRef =
    useRef<HTMLDivElement>(null);

  const outlineRef =
    useRef<HTMLDivElement>(null);

  const strokeRef =
    useRef<SVGPathElement>(null);

  const logoRef =
    useRef<HTMLDivElement>(null);

  const bottleRef =
    useRef<HTMLDivElement>(null);

  const [timeline] =
    useState(getTimeline);

  const [isCoverDone, setIsCoverDone] =
    useState(false);

  const [hasBottle, setHasBottle] =
    useState(true);

  const notifyCovered =
    useEffectEvent(onCovered);

  const notifyFinished =
    useEffectEvent(onFinished);

  /* Ato 1 — vermelho invade a tela, garrafa atravessa. */

  useEffect(() => {
    const scene = readScene({
      curtain: curtainRef,
      outline: outlineRef,
      stroke: strokeRef,
      logo: logoRef,
      bottle: bottleRef,
    });

    const animations = playTracks(
      scene,
      timeline.cover,
    );

    const curtainAnimations =
      animations.filter(
        (_, index) =>
          timeline.cover[index].target ===
          "curtain",
      );

    whenFinished(curtainAnimations).then(
      notifyCovered,
      ignoreCancel,
    );

    whenFinished(animations).then(
      () => setIsCoverDone(true),
      ignoreCancel,
    );

    return () => cancelAll(animations);
  }, [timeline]);

  /* Ato 2 — destino pronto: garrafa e vermelho saem pela direita. */

  useEffect(() => {
    if (!isCoverDone || !canReveal) {
      return;
    }

    const animations = playTracks(
      readScene({
        curtain: curtainRef,
        outline: outlineRef,
        stroke: strokeRef,
        logo: logoRef,
        bottle: bottleRef,
      }),
      timeline.reveal,
    );

    whenFinished(animations).then(
      notifyFinished,
      ignoreCancel,
    );

    return () => cancelAll(animations);
  }, [
    timeline,
    isCoverDone,
    canReveal,
  ]);

  return (
    <div
      className="login-transition"
      aria-hidden="true"
    >
      <div
        ref={curtainRef}
        className="login-transition-curtain"
      >
        <svg
          className="login-transition-edge"
          viewBox="0 0 205 1000"
          preserveAspectRatio="none"
        >
          <path d={BRAND_CURVE_PATH} />
        </svg>

        <div className="login-transition-fill">
          <div className="login-transition-glow" />
        </div>

        <svg
          className="login-transition-edge login-transition-edge-leading"
          viewBox="0 0 205 1000"
          preserveAspectRatio="none"
        >
          <path d={BRAND_CURVE_PATH} />
        </svg>
      </div>

      <div
        ref={outlineRef}
        className="login-transition-outline"
      >
        <svg
          viewBox={BOTTLE_OUTLINE_VIEWBOX}
          className="block h-full w-full overflow-visible"
        >
          <path
            ref={strokeRef}
            d={BOTTLE_OUTLINE_PATH}
            pathLength={1}
            className="login-transition-outline-stroke"
          />
        </svg>

        <div
          ref={logoRef}
          className="login-transition-logo"
        >
          <Image
            src="/logo.webp"
            alt=""
            width={240}
            height={75}
            className="h-auto w-full object-contain brightness-0 invert"
          />
        </div>
      </div>

      <div
        ref={bottleRef}
        className="login-transition-bottle"
      >
        {hasBottle && (
          <Image
            src={LOGIN_TRANSITION_BOTTLE_SRC}
            alt=""
            width={120}
            height={400}
            unoptimized
            onError={() =>
              setHasBottle(false)
            }
            className="login-transition-bottle-image"
          />
        )}
      </div>
    </div>
  );
}

function readScene(
  refs: Record<
    SceneElement,
    RefObject<Element | null>
  >,
): Scene {
  const scene = {} as Scene;

  for (const [name, ref] of Object.entries(refs)) {
    if (!ref.current) {
      throw new Error(
        "Elementos da transição de login não montados.",
      );
    }

    scene[name as SceneElement] =
      ref.current;
  }

  return scene;
}
