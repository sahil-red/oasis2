"use client";

import { useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Search-loader mascots — professionally-animated Lottie vectors, shown ONE AT A
 * TIME and cross-faded as the wait goes on (a little carousel of cute cats).
 * Most loop centred; "cross" pieces (Kiki the witch on her broom) FLY the full
 * width on their turn, then hand off to the next cat.
 *
 * The Lottie player stays MOUNTED for the whole carousel — we only change its
 * `src` and reposition its (single, stable) wrapper — so there's no wasm re-init
 * and no blank flash; each swap is hidden under a short opacity fade.
 *
 * Player is lazy-loaded (next/dynamic, ssr:false) → the wasm renderer never
 * touches the initial bundle, only loads when a search runs. Reduced-motion → one
 * calm, still cat, centred, no auto-advance.
 */

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false, loading: () => null },
);

type Asset = { src: string; size: number; cross?: "rtl" | "ltr" };

const ASSETS: Asset[] = [
  { src: "preloader-cat.json", size: 190 }, // cat draped over the bar
  { src: "cat.lottie", size: 190 }, // grey cat, speech bubble + flowers
  { src: "meow.lottie", size: 182 }, // cat in fairy lights
  { src: "no-connection.lottie", size: 186 }, // blue cat + hearts
  { src: "ghibli.lottie", size: 150, cross: "rtl" }, // Kiki the witch + Jiji — flies across ←
  // staged but OFF by default — enable if you want them:
  //   comp-a.lottie  (sprinting cat, but "INVITE YOUR FRIENDS!" text baked in)
  //   comp-b.lottie  (grumpy cat, but LottieFiles watermark)
  //   pumpkin.lottie / witch.lottie (off-theme: jack-o-lantern / woman at desk)
];

const SLOT_MS = (a: Asset) => (a.cross ? 4200 : 2800);
const FADE = 340;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function SearchCats({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const order = useMemo(() => shuffle(ASSETS), []);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  const asset = order[i % order.length]!;
  const isCross = !!asset.cross && !reduce;
  const bgCleared = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const slot = SLOT_MS(asset);
    const out = setTimeout(() => setShow(false), slot - FADE); // fade current out
    const next = setTimeout(() => { setI((v) => v + 1); setShow(true); }, slot); // swap src + fade in
    return () => { clearTimeout(out); clearTimeout(next); };
  }, [i, reduce, asset]);

  return (
    <div className={`relative h-[190px] w-full overflow-hidden ${className}`} aria-hidden>
      <style>{FLY_STYLE}</style>
      <div
        className="absolute inset-0 transition-opacity ease-out"
        style={{ opacity: show ? 1 : 0, transitionDuration: `${FADE}ms` }}
      >
        {/* Single, persistent wrapper: centred for normal cats, or flying for "cross".
            The player child never remounts — only its src / this wrapper change. */}
        <div
          className={`absolute top-1/2 ${isCross ? "cat-fly" : ""}`}
          style={
            isCross
              ? ({ ["--cw" as string]: `${asset.size}px`, animationName: asset.cross === "rtl" ? "catFlyRtl" : "catFlyLtr", transform: "translateY(-50%)" } as React.CSSProperties)
              : { left: "50%", transform: "translate(-50%, -50%)" }
          }
        >
          <DotLottieReact
            src={`/lottie/${asset.src}`}
            loop
            autoplay
            style={{ width: asset.size, height: asset.size }}
            dotLottieRefCallback={(dotLottie) => {
              if (dotLottie && !bgCleared.current) {
                bgCleared.current = true;
                dotLottie.setBackgroundColor("transparent");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Flight runs LONGER than the slot (SLOT_MS cross = 4200) so the witch is still
// on-screen (left-of-centre) when the crossfade hands off — she clearly flies
// most of the way across, but never leaves the stage empty. Entry from the right
// edge is quick and hidden under the fade-in.
const FLY_STYLE = `
.cat-fly { animation-duration: 5.6s; animation-timing-function: linear; animation-iteration-count: 1; animation-fill-mode: both; will-change: left; }
@keyframes catFlyRtl { from { left: 94%; } to { left: calc(-1 * var(--cw)); } }
@keyframes catFlyLtr { from { left: calc(94% - var(--cw)); } to { left: 100%; } }
`;
