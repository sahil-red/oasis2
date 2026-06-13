"use client";

import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

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

type Asset = { src: string; cross?: "rtl" | "ltr" };

const ASSETS: Asset[] = [
  { src: "preloader-cat.json" }, // cat draped over the bar
  { src: "cat.lottie" }, // grey cat, speech bubble + flowers
  { src: "meow.lottie" }, // cat in fairy lights
  { src: "no-connection.lottie" }, // blue cat + hearts
  { src: "ghibli.lottie", cross: "rtl" }, // Kiki the witch + Jiji — flies across ←
  // staged but OFF by default — enable if you want them:
  //   comp-a.lottie  (sprinting cat, but "INVITE YOUR FRIENDS!" text baked in)
  //   comp-b.lottie  (grumpy cat, but LottieFiles watermark)
  //   pumpkin.lottie / witch.lottie (off-theme: jack-o-lantern / woman at desk)
];

// ONE constant canvas size for every cat. The player reuses a single canvas
// across swaps; changing its pixel size per-asset made the WASM buffer mismatch
// the canvas and leave garbled/stale pixels in the centre. A fixed size keeps the
// buffer valid — each animation just scales itself to fit.
const CANVAS = 196;
const SLOT_MS = (a: Asset) => (a.cross ? 4200 : 2800);
const FADE = 340;
const SWAP_HIDE = 240; // stay hidden this long after a src swap so the new frame paints first

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
  // Deterministic on the server + first client render (no Math.random in render →
  // no hydration mismatch); reshuffled once after mount for variety.
  const [order, setOrder] = useState<Asset[]>(ASSETS);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => { setOrder(shuffle(ASSETS)); }, []);
  const asset = order[i % order.length]!;
  const isCross = !!asset.cross && !reduce;

  // The player reuses ONE canvas, so on a src swap it keeps showing the previous
  // animation's last frame until the new one paints — that was the "ghost in the
  // centre". Fix: keep opacity 0 from the moment we swap src, give the new cat a
  // beat to paint, THEN fade it in. So a stale frame is never visible.
  useEffect(() => {
    if (reduce) { setShow(true); return; }
    setShow(false); // hidden through the (just-applied) src swap
    const slot = SLOT_MS(asset);
    const fadeIn = setTimeout(() => setShow(true), SWAP_HIDE); // new frame has painted → reveal
    const fadeOut = setTimeout(() => setShow(false), slot - FADE); // fade current out
    const advance = setTimeout(() => setI((v) => v + 1), slot); // swap to next
    return () => { clearTimeout(fadeIn); clearTimeout(fadeOut); clearTimeout(advance); };
  }, [i, reduce, asset]);

  // Some Lotties carry an opaque background fill — make the canvas transparent.
  const onPlayerRef = useCallback((dotLottie: DotLottie | null) => {
    dotLottie?.setBackgroundColor("transparent");
  }, []);

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
              ? ({ ["--cw" as string]: `${CANVAS}px`, animationName: asset.cross === "rtl" ? "catFlyRtl" : "catFlyLtr", transform: "translateY(-50%)" } as React.CSSProperties)
              : { left: "50%", transform: "translate(-50%, -50%)" }
          }
        >
          <DotLottieReact
            src={`/lottie/${asset.src}`}
            loop
            autoplay
            style={{ width: CANVAS, height: CANVAS }}
            dotLottieRefCallback={onPlayerRef}
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
