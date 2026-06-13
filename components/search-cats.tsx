"use client";

/**
 * Search-loader cats — custom flat vectors matching the product sketch.
 * One light-grey + one dark-grey character; fixed poses per vignette (no random styles).
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";

/** Sketch colours: blue-grey tabby + charcoal tabby, thin dark outline. */
const LIGHT = { fill: "#b8c0cb", stroke: "#3d434c" };
const DARK = { fill: "#5a616c", stroke: "#2a2e34" };

type Pose =
  | "leap"
  | "stretch"
  | "sprint"
  | "pounce"
  | "stand"
  | "sit"
  | "play"
  | "sleepCurl"
  | "sleepBelly"
  | "nose";

type Vignette = {
  id: string;
  left: Pose;
  right: Pose;
  props?: Array<"yarn" | "hearts" | "butterfly" | "zzz" | "dust" | "speed">;
  meet?: boolean;
};

/** Rows from the reference sketch — left is always light, right is always dark. */
const VIGNETTES: Vignette[] = [
  { id: "leap", left: "leap", right: "leap", meet: true },
  { id: "stretch", left: "stretch", right: "sit", props: ["yarn"] },
  { id: "chase", left: "sprint", right: "pounce", props: ["speed", "dust"] },
  { id: "dream", left: "stand", right: "sleepBelly", props: ["hearts"] },
  { id: "butterfly", left: "play", right: "sit", props: ["butterfly"] },
  { id: "nap", left: "sleepCurl", right: "sleepBelly", props: ["zzz"] },
  { id: "boop", left: "nose", right: "nose", meet: true },
];

const SCENE_MS = 2600;
const FADE = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };
const EASE = [0.22, 1, 0.36, 1] as const;

const SW = 1.75;

function Face({
  stroke,
  cx,
  cy,
  closed = false,
}: {
  stroke: string;
  cx: number;
  cy: number;
  closed?: boolean;
}) {
  if (closed) {
    return (
      <>
        <path d={`M${cx - 4} ${cy} Q${cx - 1} ${cy + 2} ${cx + 2} ${cy}`} fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
        <path d={`M${cx + 4} ${cy} Q${cx + 1} ${cy + 2} ${cx - 2} ${cy}`} fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <circle cx={cx - 3} cy={cy} r="1.5" fill={stroke} stroke="none" />
      <circle cx={cx + 3} cy={cy} r="1.5" fill={stroke} stroke="none" />
      <path d={`M${cx - 1.5} ${cy + 4} Q${cx} ${cy + 6} ${cx + 1.5} ${cy + 4}`} fill="none" stroke={stroke} strokeWidth="1" strokeLinecap="round" />
    </>
  );
}

function CatArt({ fill, stroke, pose, mirror }: { fill: string; stroke: string; pose: Pose; mirror?: boolean }) {
  const g = (children: React.ReactNode) => (
    <svg
      viewBox="0 0 100 76"
      className="h-[92px] w-[100px] sm:h-[108px] sm:w-[118px]"
      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      <g stroke={stroke} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round" fill={fill}>
        {children}
      </g>
    </svg>
  );

  switch (pose) {
    case "leap":
      return g(
        <>
          <path d="M18 48 C8 44 6 36 14 30 C22 24 38 26 52 28 L78 32 C88 34 92 40 86 46 C80 52 58 54 40 52 Z" />
          <path d="M52 28 C62 22 74 20 82 26 C88 32 84 38 76 40 L58 38 Z" />
          <path d="M14 30 L10 18 L20 26 Z" />
          <path d="M24 26 L22 14 L30 24 Z" />
          <path d="M30 50 L26 64 L34 64 Z" fill={fill} />
          <path d="M44 52 L40 66 L48 66 Z" fill={fill} />
          <path d="M68 48 L72 62 L64 62 Z" fill={fill} />
          <path d="M80 44 L86 58 L78 58 Z" fill={fill} />
          <path d="M16 42 C4 38 0 28 8 20 C12 24 10 34 18 40 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={78} cy={30} />
        </>,
      );

    case "sprint":
      return g(
        <>
          <path d="M14 50 C8 46 10 38 20 34 C32 30 50 32 68 34 C82 36 88 42 82 48 C74 54 48 56 28 54 Z" />
          <circle cx="84" cy="36" r="11" />
          <path d="M76 26 L72 14 L82 24 Z" />
          <path d="M90 24 L96 14 L88 24 Z" />
          <line x1="8" y1="40" x2="0" y2="40" strokeWidth="1.4" />
          <line x1="10" y1="48" x2="2" y2="50" strokeWidth="1.4" />
          <path d="M22 52 L18 66 L26 66 Z" fill={fill} />
          <path d="M38 54 L34 68 L42 68 Z" fill={fill} />
          <path d="M62 52 L66 66 L58 66 Z" fill={fill} />
          <path d="M76 50 L82 64 L74 64 Z" fill={fill} />
          <path d="M12 44 C2 40 -2 30 6 22 C10 28 8 36 16 42 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={86} cy={35} />
        </>,
      );

    case "stretch":
      return g(
        <>
          <path d="M20 56 C16 48 24 40 40 38 C56 36 72 40 80 48 C84 52 78 58 64 58 L36 58 C28 58 22 56 20 56 Z" />
          <ellipse cx="36" cy="52" rx="18" ry="10" fill={fill} stroke="none" />
          <circle cx="86" cy="52" r="10" />
          <path d="M80 44 L76 32 L88 42 Z" />
          <path d="M92 42 L98 32 L94 44 Z" />
          <path d="M24 56 L18 68 L28 68 Z" fill={fill} />
          <path d="M36 56 L32 68 L42 68 Z" fill={fill} />
          <path d="M68 54 L72 68 L64 68 Z" fill={fill} />
          <path d="M80 52 L86 66 L78 66 Z" fill={fill} />
          <path d="M14 50 C6 32 10 18 22 12 C18 22 16 36 20 48 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={88} cy={51} />
        </>,
      );

    case "pounce":
      return g(
        <>
          <path d="M24 44 C18 36 28 28 48 26 C68 24 84 30 88 40 C90 48 80 54 60 54 L34 52 Z" />
          <circle cx="86" cy="38" r="10" />
          <path d="M80 30 L76 18 L86 28 Z" />
          <path d="M92 28 L98 18 L94 30 Z" />
          <path d="M30 50 L26 66 L34 66 Z" fill={fill} />
          <path d="M48 52 L44 68 L52 68 Z" fill={fill} />
          <path d="M70 48 L76 64 L68 64 Z" fill={fill} />
          <path d="M82 46 L90 60 L82 60 Z" fill={fill} />
          <path d="M18 40 C8 28 6 16 16 10 C14 18 16 30 22 38 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={88} cy={37} />
        </>,
      );

    case "stand":
      return g(
        <>
          <path d="M30 58 C26 42 36 32 50 32 C64 32 72 42 70 58 Z" />
          <circle cx="50" cy="24" r="12" />
          <path d="M40 14 L36 2 L48 12 Z" />
          <path d="M60 14 L64 2 L52 12 Z" />
          <path d="M38 58 L34 68 L42 68 Z" fill={fill} />
          <path d="M58 58 L62 68 L54 68 Z" fill={fill} />
          <path d="M68 50 C78 48 82 38 76 30 C74 36 70 44 64 48 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={50} cy={24} />
        </>,
      );

    case "sit":
      return g(
        <>
          <ellipse cx="50" cy="56" rx="16" ry="14" />
          <circle cx="50" cy="34" r="14" />
          <path d="M36 22 L32 8 L44 20 Z" />
          <path d="M64 22 L68 8 L56 20 Z" />
          <path d="M42 66 L38 72 L46 72 Z" fill={fill} />
          <path d="M58 66 L62 72 L54 72 Z" fill={fill} />
          <path d="M66 52 C74 50 78 42 74 36 C72 42 68 48 62 50 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={50} cy={34} />
        </>,
      );

    case "play":
      return g(
        <>
          <ellipse cx="44" cy="52" rx="14" ry="18" />
          <circle cx="48" cy="28" r="11" />
          <path d="M40 18 L36 6 L46 16 Z" />
          <path d="M56 16 L60 4 L52 14 Z" />
          <path d="M36 48 L30 36 L40 42 Z" fill={fill} />
          <path d="M52 44 L58 30 L48 38 Z" fill={fill} />
          <path d="M52 66 L48 72 L56 72 Z" fill={fill} />
          <path d="M36 66 L32 72 L40 72 Z" fill={fill} />
          <path d="M28 54 C20 46 18 36 24 28 C26 34 28 44 32 50 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={50} cy={27} />
        </>,
      );

    case "sleepCurl":
      return g(
        <>
          <ellipse cx="52" cy="48" rx="28" ry="18" />
          <circle cx="36" cy="42" r="12" />
          <path d="M26 34 L22 24 L32 36 Z" />
          <path d="M42 32 L46 22 L38 34 Z" />
          <path d="M72 46 C82 44 86 36 80 30 C78 36 74 42 68 44 Z" fill={fill} stroke={stroke} />
          <g stroke={stroke} strokeWidth="1.2" fill="none">
            <path d="M30 42 Q34 46 38 42" strokeLinecap="round" />
            <path d="M40 42 Q44 46 48 42" strokeLinecap="round" />
          </g>
        </>,
      );

    case "sleepBelly":
      return g(
        <>
          <ellipse cx="52" cy="50" rx="30" ry="12" />
          <circle cx="78" cy="46" r="10" />
          <path d="M72 38 L68 28 L78 38 Z" />
          <path d="M84 36 L90 28 L86 38 Z" />
          <path d="M24 48 C16 46 14 40 18 36 C20 40 22 44 28 46 Z" fill={fill} stroke={stroke} />
          <path d="M30 52 L26 64 L34 64 Z" fill={fill} />
          <path d="M44 54 L40 66 L48 66 Z" fill={fill} />
          <path d="M62 54 L66 66 L58 66 Z" fill={fill} />
          <path d="M74 52 L80 64 L72 64 Z" fill={fill} />
          <Face stroke={stroke} cx={80} cy={45} closed />
        </>,
      );

    case "nose":
      return g(
        <>
          <path d="M16 50 C10 46 12 38 24 34 C38 30 58 32 72 34 C84 36 88 42 82 48 C74 54 48 56 30 54 Z" />
          <circle cx="86" cy="38" r="11" />
          <path d="M78 28 L74 16 L84 26 Z" />
          <path d="M92 26 L98 16 L94 28 Z" />
          <circle cx="94" cy="42" r="2" fill="#e8a0b0" stroke="none" />
          <path d="M22 52 L18 66 L26 66 Z" fill={fill} />
          <path d="M38 54 L34 68 L42 68 Z" fill={fill} />
          <path d="M62 52 L66 66 L58 66 Z" fill={fill} />
          <path d="M76 50 L82 64 L74 64 Z" fill={fill} />
          <path d="M12 44 C2 40 -2 30 6 22 C10 28 8 36 16 42 Z" fill={fill} stroke={stroke} />
          <Face stroke={stroke} cx={86} cy={37} />
        </>,
      );
  }
}

const poseMotion: Record<
  Pose,
  { animate: { x?: number[]; y?: number[]; rotate?: number[]; scale?: number[]; scaleY?: number[] }; transition: object }
> = {
  leap: { animate: { y: [0, -6, 0] }, transition: { duration: 0.5, repeat: Infinity, ease: EASE } },
  sprint: { animate: { x: [0, 3, 0] }, transition: { duration: 0.28, repeat: Infinity, ease: "linear" } },
  stretch: { animate: { y: [0, 2, 0] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  pounce: { animate: { y: [0, -10, 2, 0] }, transition: { duration: 0.65, repeat: Infinity, ease: EASE } },
  stand: { animate: { y: [0, -1, 0] }, transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" } },
  sit: { animate: { rotate: [0, 2, 0] }, transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  play: { animate: { y: [0, -5, 0] }, transition: { duration: 0.75, repeat: Infinity, ease: EASE } },
  sleepCurl: { animate: { scale: [1, 1.02, 1] }, transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } },
  sleepBelly: { animate: { scaleY: [1, 1.03, 1] }, transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } },
  nose: { animate: { x: [0, 4, 0] }, transition: { duration: 1.1, repeat: Infinity, ease: EASE } },
};

function CatSlot({
  side,
  pose,
  coat,
  mirror,
  meet,
}: {
  side: "left" | "right";
  pose: Pose;
  coat: typeof LIGHT;
  mirror?: boolean;
  meet?: boolean;
}) {
  const reduced = useReducedMotion();
  const drift = meet ? (side === "left" ? 16 : -16) : 0;
  const motionCfg = poseMotion[pose];

  return (
    <motion.div
      className="flex shrink-0 items-end"
      initial={false}
      animate={{ x: drift }}
      transition={{ duration: 1.6, ease: EASE }}
    >
      <motion.div
        animate={reduced ? {} : motionCfg.animate}
        transition={reduced ? { duration: 0 } : motionCfg.transition}
        style={{ transformOrigin: "center bottom" }}
      >
        <CatArt fill={coat.fill} stroke={coat.stroke} pose={pose} mirror={mirror} />
      </motion.div>
    </motion.div>
  );
}

function SceneProps({ items }: { items: Vignette["props"] }) {
  if (!items?.length) return null;
  return (
    <svg viewBox="0 0 100 48" className="pointer-events-none mt-1 h-9 w-full max-w-[110px]" aria-hidden>
      {items.includes("yarn") && (
        <g transform="translate(50 40)">
          <circle r="8" fill="#b86a4a" stroke="#3d434c" strokeWidth="1.2" />
          <path d="M-6 -2 C-1 -6 4 -6 7 -1 M-7 2 C-2 5 5 6 7 1" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="0.9" />
        </g>
      )}
      {items.includes("speed") && (
        <g stroke="#3d434c" strokeWidth="1.3" strokeLinecap="round" opacity="0.35">
          <path d="M8 24 H0" />
          <path d="M10 30 H2" />
        </g>
      )}
      {items.includes("dust") && (
        <g fill="none" stroke="#3d434c" strokeWidth="1.2" opacity="0.4">
          <circle cx="82" cy="36" r="4" />
          <circle cx="90" cy="32" r="2.5" />
          <circle cx="76" cy="32" r="2" />
        </g>
      )}
      {items.includes("hearts") && (
        <g fill="#e87a93" transform="translate(72 14)">
          <path d="M0 2 C-2 -1 -5 0 -5 3 C-5 6 0 9 0 9 C0 9 5 6 5 3 C5 0 2 -1 0 2 Z" />
          <path d="M8 -2 C6 -4 4 -3 4 -1 C4 1 8 3 8 3 C8 3 12 1 12 -1 C12 -3 10 -4 8 -2 Z" opacity="0.75" />
        </g>
      )}
      {items.includes("butterfly") && (
        <g transform="translate(48 10)" className="animate-bounce motion-reduce:animate-none">
          <path d="M0 0 C-8 -8 -12 -2 -10 3 C-8 7 -2 4 0 0 Z" fill="#e98bb6" stroke="#3d434c" strokeWidth="0.8" />
          <path d="M0 0 C8 -8 12 -2 10 3 C8 7 2 4 0 0 Z" fill="#e98bb6" stroke="#3d434c" strokeWidth="0.8" />
          <ellipse rx="1" ry="3.5" fill="#4a4038" stroke="none" />
        </g>
      )}
      {items.includes("zzz") && (
        <g fill="none" stroke="var(--color-fg-dim)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M36 16 L42 16 L36 22 L42 22" />
          <path d="M46 10 L54 10 L46 18 L54 18" opacity="0.65" />
          <path d="M58 4 L68 4 L58 14 L68 14" opacity="0.4" />
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

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setSceneIndex((i) => (i + 1) % VIGNETTES.length);
    }, SCENE_MS);
    return () => clearInterval(t);
  }, [reduced]);

  const vignette = VIGNETTES[sceneIndex]!;
  const sceneKey = useMemo(() => `${vignette.id}-${sceneIndex}`, [vignette.id, sceneIndex]);

  return (
    <div className={`flex w-full flex-col items-center gap-4 ${className}`} aria-hidden>
      <div className="relative w-full min-h-[132px] sm:min-h-[148px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={sceneKey}
            className="absolute inset-0 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            <div className="flex w-full max-w-[680px] items-end justify-center gap-0 px-2 sm:gap-2 sm:px-4">
              <CatSlot side="left" pose={vignette.left} coat={LIGHT} meet={vignette.meet} />
              <div className="relative z-10 flex min-h-[92px] min-w-[8rem] flex-1 flex-col items-center justify-end px-1 pb-1 sm:min-w-[10rem]">
                {center}
                <SceneProps items={vignette.props} />
              </div>
              <CatSlot side="right" pose={vignette.right} coat={DARK} mirror meet={vignette.meet} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="mx-auto h-0.5 w-[min(90%,600px)]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, var(--color-line) 0 5px, transparent 5px 14px)",
        }}
      />
    </div>
  );
}
