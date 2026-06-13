"use client";

/**
 * AI-search wait vignettes — two cats flanking the status line.
 * Lottie behavior pool (LottieFiles / Lottie Simple License): run, stretch,
 * pounce, sit, play, sleep, nose. Either cat can play any behavior; roles shuffle each scene.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Behavior = "run" | "stretch" | "pounce" | "sit" | "play" | "sleep" | "nose";

type Vignette = {
  id: string;
  a: Behavior;
  b: Behavior;
  props?: Array<"yarn" | "hearts" | "butterfly" | "zzz" | "dust">;
  /** Both cats drift toward center (nose boop / leap). */
  meet?: boolean;
  speedA?: number;
  speedB?: number;
};

const VIGNETTES: Vignette[] = [
  { id: "leap", a: "run", b: "run", meet: true, speedA: 1.05, speedB: 1.05 },
  { id: "stretch-yarn", a: "stretch", b: "sit", props: ["yarn"], speedA: 0.9, speedB: 1 },
  { id: "chase", a: "run", b: "pounce", props: ["dust"], speedA: 1.15, speedB: 1 },
  { id: "dream", a: "sit", b: "sleep", props: ["hearts"], speedA: 1, speedB: 0.85 },
  { id: "butterfly", a: "play", b: "sit", props: ["butterfly"], speedA: 1, speedB: 1 },
  { id: "nap", a: "sleep", b: "sleep", props: ["zzz"], speedA: 0.85, speedB: 0.85 },
  { id: "boop", a: "run", b: "run", meet: true, speedA: 0.95, speedB: 0.95 },
];

const BEHAVIORS: Behavior[] = ["run", "stretch", "pounce", "sit", "play", "sleep", "nose"];

const SCENE_MS = 2400;
const FADE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

const lottieCache = new Map<Behavior, object>();

function loadBehavior(behavior: Behavior): Promise<object> {
  const hit = lottieCache.get(behavior);
  if (hit) return Promise.resolve(hit);
  return fetch(`/lottie/cats/${behavior}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`lottie ${behavior}`);
      return r.json();
    })
    .then((data) => {
      lottieCache.set(behavior, data);
      return data;
    });
}

function useLottiePool() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(BEHAVIORS.map(loadBehavior))
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

function CatLottie({
  behavior,
  mirror,
  speed = 1,
  className = "",
}: {
  behavior: Behavior;
  mirror?: boolean;
  speed?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [data, setData] = useState<object | null>(() => lottieCache.get(behavior) ?? null);

  useEffect(() => {
    let alive = true;
    loadBehavior(behavior).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [behavior]);

  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed, data]);

  return (
    <div
      className={`h-[108px] w-[108px] sm:h-[124px] sm:w-[124px] ${className}`}
      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
    >
      {data ? (
        <Lottie
          lottieRef={lottieRef}
          animationData={data}
          loop={!reduced}
          autoplay={!reduced}
          style={{ width: "100%", height: "100%" }}
          rendererSettings={{ preserveAspectRatio: "xMidYMax meet" }}
        />
      ) : (
        <div className="h-full w-full animate-pulse rounded-full bg-(--color-bg-soft) motion-reduce:animate-none" />
      )}
    </div>
  );
}

function CatSlot({
  side,
  vignette,
  behavior,
  speed,
  mirror,
}: {
  side: "left" | "right";
  vignette: Vignette;
  behavior: Behavior;
  speed?: number;
  mirror?: boolean;
}) {
  const meet = vignette.meet;
  const drift = meet ? (side === "left" ? 18 : -18) : 0;

  return (
    <motion.div
      className="flex shrink-0"
      initial={false}
      animate={{ x: drift }}
      transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <CatLottie behavior={behavior} mirror={mirror} speed={speed} />
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
          <path d="M52 20 C49 16 44 18 44 22 C44 26 52 30 52 30 C52 30 60 26 60 22 C60 18 55 16 52 20 Z" className="animate-bounce motion-reduce:animate-none" />
          <path d="M68 14 C66 11 62 12 62 15 C62 18 68 21 68 21 C68 21 74 18 74 15 C74 12 70 11 68 14 Z" opacity="0.7" />
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
  /** Status line rendered between the two cats (sketch layout). */
  center?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const poolReady = useLottiePool();
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
    <div className={`flex w-full flex-col items-center gap-5 ${className}`}>
      <div className="relative w-full min-h-[148px] sm:min-h-[168px]">
        {poolReady ? (
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
                <CatSlot side="left" vignette={vignette} behavior={behA} speed={vignette.speedA} />
                <div className="relative z-10 flex min-h-[108px] min-w-[7.5rem] flex-1 flex-col items-center justify-center px-1 sm:min-w-[9rem] sm:px-2">
                  {center}
                  <SceneProps items={vignette.props} />
                </div>
                <CatSlot side="right" vignette={vignette} behavior={behB} speed={vignette.speedB} mirror />
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="flex h-[148px] items-end justify-center gap-4 px-4">
            <div className="h-[108px] w-[108px] animate-pulse rounded-2xl bg-(--color-bg-soft) motion-reduce:animate-none" />
            <div className="h-8 w-32 animate-pulse rounded bg-(--color-bg-soft) motion-reduce:animate-none" />
            <div className="h-[108px] w-[108px] animate-pulse rounded-2xl bg-(--color-bg-soft) motion-reduce:animate-none" />
          </div>
        )}
      </div>

      <div
        className="mx-auto h-0.5 w-[min(92%,640px)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--color-line) 0 6px, transparent 6px 18px)",
        }}
        aria-hidden
      />
    </div>
  );
}
