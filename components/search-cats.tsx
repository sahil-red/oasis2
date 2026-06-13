"use client";

/**
 * AI-search wait — two matching cats (light + dark grey) flanking the status line.
 * One shared silhouette, behavior-driven Framer Motion poses. Either cat can play any action.
 */

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Behavior = "run" | "stretch" | "pounce" | "sit" | "play" | "sleep" | "nose";

type Coat = {
  body: string;
  bodyDark: string;
  belly: string;
  ear: string;
  line: string;
};

/** Sketch palette: light grey + dark grey tabbies — same shape, different coats. */
const COAT_LIGHT: Coat = {
  body: "#b8bcc4",
  bodyDark: "#9aa0a8",
  belly: "#e8eaed",
  ear: "#d4a8b4",
  line: "rgba(42, 46, 54, 0.45)",
};
const COAT_DARK: Coat = {
  body: "#5a5f68",
  bodyDark: "#454950",
  belly: "#8a9099",
  ear: "#b8929e",
  line: "rgba(18, 20, 26, 0.5)",
};

type Vignette = {
  id: string;
  a: Behavior;
  b: Behavior;
  props?: Array<"yarn" | "hearts" | "butterfly" | "zzz" | "dust">;
  meet?: boolean;
};

const VIGNETTES: Vignette[] = [
  { id: "leap", a: "run", b: "run", meet: true },
  { id: "stretch-yarn", a: "stretch", b: "sit", props: ["yarn"] },
  { id: "chase", a: "run", b: "pounce", props: ["dust"] },
  { id: "dream", a: "sit", b: "sleep", props: ["hearts"] },
  { id: "butterfly", a: "play", b: "sit", props: ["butterfly"] },
  { id: "nap", a: "sleep", b: "sleep", props: ["zzz"] },
  { id: "boop", a: "nose", b: "nose", meet: true },
];

const SCENE_MS = 2400;
const FADE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };
const EASE = [0.22, 1, 0.36, 1] as const;

const legNear: Variants = {
  run: {
    rotate: [28, -28, 28],
    transition: { duration: 0.36, repeat: Infinity, ease: "easeInOut" },
  },
  pounce: {
    rotate: [40, -12, 40],
    transition: { duration: 0.55, repeat: Infinity, ease: EASE },
  },
  play: {
    rotate: [-8, -52, -8],
    transition: { duration: 0.7, repeat: Infinity, ease: EASE },
  },
  stretch: { rotate: 18, transition: { duration: 0.6, ease: EASE } },
  sit: { rotate: 4, transition: { duration: 0.5 } },
  sleep: { rotate: 0 },
  nose: { rotate: 6, transition: { duration: 0.5 } },
};

const legFar: Variants = {
  run: {
    rotate: [28, -28, 28],
    transition: { duration: 0.36, repeat: Infinity, ease: "easeInOut", delay: 0.18 },
  },
  pounce: {
    rotate: [40, -12, 40],
    transition: { duration: 0.55, repeat: Infinity, ease: EASE, delay: 0.12 },
  },
  play: {
    rotate: [-8, -52, -8],
    transition: { duration: 0.7, repeat: Infinity, ease: EASE, delay: 0.1 },
  },
  stretch: { rotate: 12, transition: { duration: 0.6, ease: EASE } },
  sit: { rotate: 2, transition: { duration: 0.5 } },
  sleep: { rotate: 0 },
  nose: { rotate: 4, transition: { duration: 0.5 } },
};

const bodyPose: Variants = {
  run: {
    y: [0, -5, 0, -4, 0],
    transition: { duration: 0.36, repeat: Infinity, ease: "easeInOut" },
  },
  stretch: {
    y: 6,
    rotate: -18,
    transition: { duration: 0.8, ease: EASE },
  },
  pounce: {
    y: [0, -14, 3, 0],
    rotate: [0, -8, 4, 0],
    transition: { duration: 0.55, repeat: Infinity, ease: EASE },
  },
  sit: { y: 0, rotate: 0 },
  play: {
    y: [0, -6, 0],
    rotate: [0, -6, 0],
    transition: { duration: 0.7, repeat: Infinity, ease: EASE },
  },
  sleep: {
    scaleY: [1, 1.03, 1],
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
  nose: {
    x: [0, 5, 0],
    transition: { duration: 1.2, repeat: Infinity, ease: EASE },
  },
};

const tailPose: Variants = {
  run: {
    rotate: [-12, 14, -12],
    transition: { duration: 0.42, repeat: Infinity, ease: "easeInOut" },
  },
  stretch: { rotate: 32, transition: { duration: 0.6 } },
  pounce: { rotate: [-20, 8, -20], transition: { duration: 0.55, repeat: Infinity } },
  sit: { rotate: [-6, 10, -6], transition: { duration: 2.2, repeat: Infinity, ease: EASE } },
  play: { rotate: 16, transition: { duration: 0.5 } },
  sleep: { rotate: 24, transition: { duration: 0.5 } },
  nose: { rotate: 4, transition: { duration: 0.8 } },
};

const headPose: Variants = {
  run: { y: 0 },
  stretch: { y: 8, rotate: 12, transition: { duration: 0.6 } },
  pounce: { y: [0, 4, 0], rotate: [0, 8, 0], transition: { duration: 0.55, repeat: Infinity } },
  sit: { y: 0 },
  play: { y: -4, rotate: -10, transition: { duration: 0.5 } },
  sleep: { y: 2, rotate: 8 },
  nose: { x: [0, 7, 0], transition: { duration: 1.2, repeat: Infinity, ease: EASE } },
};

function CatFigure({
  coat,
  behavior,
  mirror,
}: {
  coat: Coat;
  behavior: Behavior;
  mirror?: boolean;
}) {
  const reduced = useReducedMotion();
  const sleeping = behavior === "sleep";
  const pose = reduced ? "sit" : behavior;

  return (
    <svg
      viewBox="0 0 148 108"
      className="h-[108px] w-[124px] sm:h-[124px] sm:w-[142px]"
      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`fur-${coat.body}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={coat.body} />
          <stop offset="100%" stopColor={coat.bodyDark} />
        </linearGradient>
      </defs>

      {sleeping ? (
        <motion.g variants={bodyPose} animate={pose} style={{ transformOrigin: "74px 80px" }}>
          <ellipse cx="74" cy="72" rx="38" ry="26" fill={`url(#fur-${coat.body})`} />
          <path
            d="M44 78 C36 58 52 44 74 44 C98 44 112 58 108 76 C100 88 82 92 68 90 C54 88 48 84 44 78 Z"
            fill={coat.belly}
          />
          <motion.path
            d="M100 76 C118 72 122 58 112 52 C108 62 102 70 94 74 Z"
            fill={`url(#fur-${coat.body})`}
            variants={tailPose}
            animate={pose}
            style={{ transformOrigin: "112px 64px" }}
          />
          <circle cx="52" cy="64" r="16" fill={`url(#fur-${coat.body})`} />
          <path d="M40 54 L36 42 L50 56 Z" fill={`url(#fur-${coat.body})`} />
          <path d="M58 52 L62 40 L48 54 Z" fill={`url(#fur-${coat.body})`} />
          <path d="M42 52 L41 46 L47 53 Z" fill={coat.ear} stroke="none" />
          <path d="M48 68 Q54 72 60 68" fill="none" stroke={coat.line} strokeWidth="1.4" />
        </motion.g>
      ) : (
        <g stroke={coat.line} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
          {/* far legs */}
          <motion.g variants={legFar} animate={pose} style={{ transformOrigin: "32px 78px" }}>
            <line x1="36" y1="76" x2="28" y2="102" stroke={coat.bodyDark} strokeWidth="6.5" />
          </motion.g>
          <motion.g variants={legFar} animate={pose} style={{ transformOrigin: "96px 78px" }}>
            <line x1="92" y1="76" x2="100" y2="102" stroke={coat.bodyDark} strokeWidth="6.5" />
          </motion.g>

          <motion.g variants={tailPose} animate={pose} style={{ transformOrigin: "22px 64px" }}>
            <path
              d="M24 62 C4 56 0 30 14 16 C22 26 18 46 30 58 Z"
              fill={`url(#fur-${coat.body})`}
              stroke="none"
            />
          </motion.g>

          <motion.g variants={bodyPose} animate={pose} style={{ transformOrigin: "70px 78px" }}>
            <ellipse cx="38" cy="60" rx="26" ry="22" fill={`url(#fur-${coat.body})`} stroke="none" />
            <path
              d="M16 64 C10 46 28 38 56 36 C84 34 108 38 120 50 C128 62 118 74 98 78 C70 84 38 82 16 64 Z"
              fill={`url(#fur-${coat.body})`}
              stroke="none"
            />
            <path
              d="M28 74 C50 80 86 78 104 68 C100 76 80 82 58 81 C46 80 36 77 28 74 Z"
              fill={coat.belly}
              stroke="none"
            />

            <motion.g variants={headPose} animate={pose} style={{ transformOrigin: "112px 48px" }}>
              <circle cx="114" cy="44" r="14" fill={`url(#fur-${coat.body})`} stroke="none" />
              <path d="M124 42 C132 42 132 50 125 52 C121 49 121 44 124 42 Z" fill={`url(#fur-${coat.body})`} stroke="none" />
              <path d="M104 34 L100 18 L114 30 Z" fill={`url(#fur-${coat.body})`} stroke="none" />
              <path d="M120 32 L128 18 L114 30 Z" fill={`url(#fur-${coat.body})`} stroke="none" />
              <path d="M107 30 L106 22 L113 29 Z" fill={coat.ear} stroke="none" />
              <path d="M122 28 L127 20 L118 28 Z" fill={coat.ear} stroke="none" />
              <ellipse cx="115" cy="42" rx="2.2" ry="3" fill={coat.line} stroke="none" />
              <circle cx="128" cy="48" r="1.6" fill={coat.ear} stroke="none" />
              <g stroke={coat.line} strokeWidth="0.9" opacity="0.55">
                <path d="M125 49 L136 47" />
                <path d="M125 52 L135 54" />
              </g>
            </motion.g>
          </motion.g>

          {/* near legs */}
          <motion.g variants={legNear} animate={pose} style={{ transformOrigin: "51px 80px" }}>
            <line x1="48" y1="78" x2="54" y2="102" stroke={coat.body} strokeWidth="7" />
          </motion.g>
          <motion.g variants={legNear} animate={pose} style={{ transformOrigin: "97px 80px" }}>
            <line x1="100" y1="78" x2="94" y2="102" stroke={coat.body} strokeWidth="7" />
          </motion.g>
        </g>
      )}
    </svg>
  );
}

function CatSlot({
  side,
  vignette,
  behavior,
  coat,
  mirror,
}: {
  side: "left" | "right";
  vignette: Vignette;
  behavior: Behavior;
  coat: Coat;
  mirror?: boolean;
}) {
  const drift = vignette.meet ? (side === "left" ? 20 : -20) : 0;

  return (
    <motion.div
      className="flex shrink-0"
      initial={false}
      animate={{ x: drift }}
      transition={{ duration: 1.8, ease: EASE }}
    >
      <CatFigure coat={coat} behavior={behavior} mirror={mirror} />
    </motion.div>
  );
}

function SceneProps({ items }: { items: Vignette["props"] }) {
  if (!items?.length) return null;
  return (
    <svg
      viewBox="0 0 120 56"
      className="pointer-events-none mt-2 h-10 w-full max-w-[120px] sm:h-12"
      aria-hidden
    >
      {items.includes("yarn") && (
        <g transform="translate(60 52)">
          <circle r="10" fill="#c45a4a" stroke="rgba(0,0,0,.12)" strokeWidth="1" />
          <path
            d="M-8 -2 C-2 -8 4 -8 8 -1 M-9 3 C-3 7 6 8 9 1 M-5 -8 C1 -2 2 6 -2 9 M6 -8 C2 -1 3 6 7 8"
            fill="none"
            stroke="rgba(0,0,0,.2)"
            strokeWidth="1"
          />
        </g>
      )}
      {items.includes("dust") && (
        <g fill="var(--color-line-strong)" opacity="0.45">
          <circle cx="88" cy="58" r="5" className="animate-ping motion-reduce:animate-none" />
          <circle cx="96" cy="54" r="3" />
          <circle cx="82" cy="54" r="2.5" />
        </g>
      )}
      {items.includes("hearts") && (
        <g fill="#e87a93">
          <path
            d="M52 20 C49 16 44 18 44 22 C44 26 52 30 52 30 C52 30 60 26 60 22 C60 18 55 16 52 20 Z"
            className="animate-bounce motion-reduce:animate-none"
          />
          <path
            d="M68 14 C66 11 62 12 62 15 C62 18 68 21 68 21 C68 21 74 18 74 15 C74 12 70 11 68 14 Z"
            opacity="0.7"
          />
        </g>
      )}
      {items.includes("butterfly") && (
        <g transform="translate(58 18)" className="animate-bounce motion-reduce:animate-none">
          <path d="M0 0 C-10 -10 -14 -3 -11 4 C-8 9 -2 5 0 0 Z" fill="#e98bb6" />
          <path d="M0 0 C10 -10 14 -3 11 4 C8 9 2 5 0 0 Z" fill="#e98bb6" />
          <ellipse rx="1.4" ry="4" fill="#5a4a3a" />
        </g>
      )}
      {items.includes("zzz") && (
        <g fill="none" stroke="var(--color-fg-dim)" strokeWidth="2" strokeLinecap="round">
          <path d="M48 18 L54 18 L48 24 L54 24" opacity="0.8" />
          <path d="M58 10 L66 10 L58 18 L66 18" opacity="0.55" />
          <path d="M70 4 L80 4 L70 14 L80 14" opacity="0.35" />
        </g>
      )}
    </svg>
  );
}

export function SearchCats({
  className = "",
  center,
}: {
  className?: string;
  center?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setSceneIndex((i) => (i + 1) % VIGNETTES.length);
      setSwapped(Math.random() < 0.5);
    }, SCENE_MS);
    return () => clearInterval(t);
  }, [reduced]);

  const vignette = VIGNETTES[sceneIndex]!;
  const behA = swapped ? vignette.b : vignette.a;
  const behB = swapped ? vignette.a : vignette.b;

  const sceneKey = useMemo(
    () => `${vignette.id}-${sceneIndex}-${swapped ? "s" : "n"}`,
    [vignette.id, sceneIndex, swapped],
  );

  return (
    <div className={`flex w-full flex-col items-center gap-5 ${className}`} aria-hidden>
      <div className="relative w-full min-h-[148px] sm:min-h-[168px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={sceneKey}
            className="absolute inset-0 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            <div className="flex w-full max-w-[720px] items-end justify-center gap-1 px-1 sm:gap-3 sm:px-4">
              <CatSlot side="left" vignette={vignette} behavior={behA} coat={COAT_LIGHT} />
              <div className="relative z-10 flex min-h-[108px] min-w-[7.5rem] flex-1 flex-col items-center justify-center px-1 sm:min-w-[9rem] sm:px-2">
                {center}
                <SceneProps items={vignette.props} />
              </div>
              <CatSlot side="right" vignette={vignette} behavior={behB} coat={COAT_DARK} mirror />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="mx-auto h-0.5 w-[min(92%,640px)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--color-line) 0 6px, transparent 6px 18px)",
        }}
      />
    </div>
  );
}
