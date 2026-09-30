/* =========================================================
   LINHA DO TEMPO DA TRANSIÇÃO DE LOGIN

   Dois atos sobre o mesmo relógio (Web Animations API):

   cover  → cortina entra pela esquerda, a garrafa atravessa
            à frente da borda e é alcançada pelo vermelho;
            com a tela vermelha, o contorno da garrafa é
            desenhado no centro e a escrita Coca-Cola surge
            dentro dele enquanto o traço se fecha.

   reveal → garrafa acelera para a direita e a cortina sai
            atrás dela, revelando o dashboard.

   A garrafa descansa ao lado do contorno (posição definida no
   CSS), então os deslocamentos abaixo são relativos a ela.
========================================================= */

export type SceneElement =
  | "curtain"
  | "outline"
  | "stroke"
  | "logo"
  | "bottle";

export interface Track {
  target: SceneElement;
  keyframes: Keyframe[];
  timing: KeyframeAnimationOptions;
}

export interface Timeline {
  cover: Track[];
  reveal: Track[];
}

const EASE_OUT =
  "cubic-bezier(0.22, 1, 0.36, 1)";

/* Cortina: arranca devagar, cruza rápido, assenta suave. */
const EASE_CURTAIN_IN =
  "cubic-bezier(0.6, 0.05, 0.3, 1)";

/* Garrafa: calibrada para correr logo à frente da borda da
   cortina e ser alcançada por ela perto do centro. */
const EASE_BOTTLE_IN =
  "cubic-bezier(0.45, 0.9, 0.15, 1)";

const EASE_BOTTLE_SPIN =
  "cubic-bezier(0.4, 0.7, 0.2, 1)";

/* Saída: garrafa acelera à frente e a borda traseira da
   cortina a persegue até as duas deixarem a tela. */
const EASE_BOTTLE_OUT =
  "cubic-bezier(0.7, 0, 0.5, 1)";

const EASE_CURTAIN_OUT =
  "cubic-bezier(0.65, 0, 0.35, 1)";

/* Inclinação da garrafa em repouso (345° ≡ -15°). */
const BOTTLE_REST_ROTATION = 345;

/* Traço à mão: arranca, mantém ritmo e fecha com calma. */
const EASE_DRAW =
  "cubic-bezier(0.45, 0, 0.25, 1)";

const HIDDEN_LOGO =
  "translateY(10px) scale(0.92)";

export const MOTION_TIMELINE: Timeline = {
  cover: [
    {
      target: "curtain",
      keyframes: [
        { translate: "-100% 0" },
        { translate: "0 0" },
      ],
      timing: {
        duration: 650,
        easing: EASE_CURTAIN_IN,
      },
    },
    {
      target: "bottle",
      keyframes: [
        { translate: "-95vw 3vh" },
        { translate: "-14.25vw -1.5vh", offset: 0.85 },
        { translate: "0 0" },
      ],
      timing: {
        duration: 1100,
        easing: EASE_BOTTLE_IN,
      },
    },
    {
      target: "bottle",
      keyframes: [
        { rotate: "-20deg" },
        { rotate: `${BOTTLE_REST_ROTATION}deg` },
      ],
      timing: {
        duration: 1100,
        easing: EASE_BOTTLE_SPIN,
      },
    },
    {
      target: "bottle",
      keyframes: [
        { scale: "0.8", easing: EASE_OUT },
        { scale: "1.06", offset: 0.55, easing: "ease-in-out" },
        { scale: "1" },
      ],
      timing: {
        duration: 1100,
      },
    },
    {
      /* Começa quando o vermelho já passou do centro da tela. */
      target: "stroke",
      keyframes: [
        { strokeDashoffset: 1, opacity: 0 },
        { opacity: 1, offset: 0.04 },
        { strokeDashoffset: 0, opacity: 1 },
      ],
      timing: {
        delay: 380,
        duration: 920,
        easing: EASE_DRAW,
      },
    },
    {
      /* Surge nos últimos ~35% do traço e assenta junto com ele. */
      target: "logo",
      keyframes: [
        { opacity: 0, transform: HIDDEN_LOGO },
        { opacity: 1, transform: "none" },
      ],
      timing: {
        delay: 900,
        duration: 400,
        easing: EASE_OUT,
      },
    },
  ],

  reveal: [
    {
      target: "bottle",
      keyframes: [
        { translate: "0 0" },
        { translate: "80vw -3vh" },
      ],
      timing: {
        duration: 850,
        easing: EASE_BOTTLE_OUT,
      },
    },
    {
      target: "bottle",
      keyframes: [
        { rotate: `${BOTTLE_REST_ROTATION}deg` },
        { rotate: "620deg" },
      ],
      timing: {
        duration: 850,
        easing: EASE_BOTTLE_OUT,
      },
    },
    {
      target: "bottle",
      keyframes: [
        { scale: "1" },
        { scale: "1.04", offset: 0.3 },
        { scale: "0.9" },
      ],
      timing: {
        duration: 850,
        easing: "ease-in",
      },
    },
    {
      target: "outline",
      keyframes: [
        { opacity: 1, transform: "none" },
        {
          opacity: 0,
          transform: "translateY(-8px) scale(0.96)",
        },
      ],
      timing: {
        duration: 320,
        easing: "ease-out",
      },
    },
    {
      target: "curtain",
      keyframes: [
        { translate: "0 0" },
        { translate: "100% 0" },
      ],
      timing: {
        duration: 800,
        easing: EASE_CURTAIN_OUT,
      },
    },
  ],
};

/* =========================================================
   MOVIMENTO REDUZIDO
   Apenas fades curtos, com tudo já em posição de repouso.
========================================================= */

const REST_POSE: Record<SceneElement, Keyframe> = {
  curtain: { translate: "0 0" },
  outline: {},
  stroke: { strokeDashoffset: 0 },
  logo: {},
  bottle: {
    translate: "0 0",
    rotate: `${BOTTLE_REST_ROTATION}deg`,
  },
};

function fade(
  target: SceneElement,
  from: number,
  to: number,
  timing: KeyframeAnimationOptions,
): Track {
  return {
    target,
    keyframes: [
      { ...REST_POSE[target], opacity: from },
      { ...REST_POSE[target], opacity: to },
    ],
    timing: {
      easing: "ease",
      ...timing,
    },
  };
}

export const REDUCED_MOTION_TIMELINE: Timeline = {
  cover: [
    fade("curtain", 0, 1, { duration: 250 }),
    fade("stroke", 0, 1, { duration: 250, delay: 100 }),
    fade("logo", 0, 1, { duration: 250, delay: 100 }),
    fade("bottle", 0, 1, { duration: 250, delay: 100 }),
  ],

  reveal: [
    fade("outline", 1, 0, { duration: 250 }),
    fade("bottle", 1, 0, { duration: 250 }),
    fade("curtain", 1, 0, { duration: 300 }),
  ],
};
