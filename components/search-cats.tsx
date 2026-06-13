"use client";

import { useState } from "react";

/**
 * The 1–5s AI-search wait, made fun: two kittens gallop and chase each other
 * across the screen, taking turns leading as they ping-pong left↔right. Pure
 * inline SVG + CSS transforms — no deps, no images, no network; vector-crisp at
 * any size and GPU-cheap. Coat colours and tempo randomise per mount, so two
 * searches running back-to-back never look the same. Respects reduced-motion.
 *
 * Positioning uses the SVG `transform` ATTRIBUTE; motion uses the CSS `transform`
 * PROPERTY on nested groups (they must live on separate nodes — CSS transform
 * overrides the attribute). transform-box:fill-box anchors every origin to the
 * element's own box.
 */

type Coat = { body: string; belly: string; ear: string; line: string; leg: string };

const COATS: Coat[] = [
  { body: "#e2904f", belly: "#f6dcbd", ear: "#c76f37", leg: "#c97e42", line: "rgba(70,40,15,.4)" }, // ginger
  { body: "#9ea4ab", belly: "#edebe7", ear: "#7c828a", leg: "#8a9098", line: "rgba(35,38,45,.4)" }, // grey
  { body: "#6f6962", belly: "#cdc6be", ear: "#544e48", leg: "#615b54", line: "rgba(18,18,22,.45)" }, // charcoal
  { body: "#e8b573", belly: "#f8eed9", ear: "#b07d44", leg: "#d2a262", line: "rgba(75,48,20,.4)" }, // butterscotch
  { body: "#d9d2c7", belly: "#fbf6ed", ear: "#bcae99", leg: "#c7bfb1", line: "rgba(80,62,34,.36)" }, // white/cream
];

function pick<T>(a: T[], not = -1): [T, number] {
  let i = Math.floor(Math.random() * a.length);
  if (i === not) i = (i + 1) % a.length;
  return [a[i]!, i];
}

/** A galloping cat in side profile, facing right. Local box ~128×120, feet y≈108. */
function RunCat({ coat, legPhase }: { coat: Coat; legPhase: string }) {
  const legProps = { stroke: coat.leg, strokeWidth: 7, strokeLinecap: "round" as const };
  const farLegProps = { stroke: coat.line, strokeWidth: 7, strokeLinecap: "round" as const, opacity: 0.85 };
  return (
    <g
      style={{ "--cb": coat.body, "--cl": coat.belly, "--ce": coat.ear, "--cln": coat.line } as React.CSSProperties}
      stroke="var(--cln)"
      strokeWidth={2.2}
      strokeLinejoin="round"
    >
      {/* far legs (behind body) */}
      <g className="scat-leg" style={{ animationDelay: legPhase }}>
        <line x1="40" y1="80" x2="34" y2="108" {...farLegProps} />
      </g>
      <g className="scat-leg" style={{ animationDelay: `calc(${legPhase} - .12s)` }}>
        <line x1="96" y1="80" x2="102" y2="108" {...farLegProps} />
      </g>

      {/* tail — streams behind, waving */}
      <g className="scat-tail">
        <path d="M22 66 C0 60 -4 32 10 18 C18 28 12 50 34 64 Z" fill="var(--cb)" />
      </g>

      {/* body group — bobs with the gait */}
      <g className="scat-body" style={{ animationDelay: legPhase }}>
        {/* haunch */}
        <circle cx="34" cy="66" r="24" fill="var(--cb)" />
        {/* torso */}
        <path d="M14 76 C8 56 20 46 44 45 C70 44 94 46 106 52 C120 60 116 78 96 83 C68 91 36 90 14 76 Z" fill="var(--cb)" />
        {/* belly */}
        <path d="M30 86 C52 92 80 91 98 81 C94 89 74 95 54 94 C42 93 34 90 30 86 Z" fill="var(--cl)" stroke="none" />
        {/* neck + head */}
        <circle cx="106" cy="46" r="15" fill="var(--cb)" />
        {/* muzzle */}
        <path d="M118 44 C126 45 126 53 119 55 C115 53 115 47 118 44 Z" fill="var(--cb)" />
        {/* ears */}
        <path d="M97 35 L94 16 L109 31 Z" fill="var(--cb)" />
        <path d="M114 33 L121 17 L107 31 Z" fill="var(--cb)" />
        <path d="M100 33 L99 23 L107 31 Z" fill="var(--ce)" stroke="none" />
        {/* eye (blinks) */}
        <ellipse className="scat-blink" cx="109" cy="43" rx="2.4" ry="3.4" fill="var(--cln)" stroke="none" />
        {/* nose */}
        <circle cx="123" cy="51" r="1.8" fill="var(--ce)" stroke="none" />
        {/* whiskers */}
        <g stroke="var(--cln)" strokeWidth="1" opacity="0.55">
          <path d="M120 52 L132 50" />
          <path d="M120 55 L131 57" />
        </g>
      </g>

      {/* near legs (in front of body) */}
      <g className="scat-leg" style={{ animationDelay: `calc(${legPhase} - .12s)` }}>
        <line x1="44" y1="82" x2="50" y2="108" {...legProps} />
      </g>
      <g className="scat-leg" style={{ animationDelay: legPhase }}>
        <line x1="92" y1="82" x2="86" y2="108" {...legProps} />
      </g>
    </g>
  );
}

export function SearchCats({ className = "" }: { className?: string }) {
  const [{ lead, chase, dur }] = useState(() => {
    const [a, ai] = pick(COATS);
    const [b] = pick(COATS, ai);
    return { lead: a, chase: b, dur: 4.4 + Math.random() * 1.6 };
  });

  return (
    <div className={`w-full ${className}`} aria-hidden>
      <style>{CAT_CSS}</style>
      <svg
        viewBox="0 0 760 132"
        className="mx-auto h-auto w-full max-w-[640px]"
        style={{ ["--scat-dur" as string]: `${dur}s` }}
      >
        {/* ground line — soft, to anchor the run */}
        <line x1="40" y1="120" x2="720" y2="120" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="2 12" strokeLinecap="round" />

        {/* chaser (trails by ~135px) */}
        <g className="scat-run" style={{ ["--reach" as string]: "320px" }}>
          <g transform="translate(20 8)">
            <RunCat coat={chase} legPhase="-0.2s" />
          </g>
        </g>
        {/* leader */}
        <g className="scat-run" style={{ ["--reach" as string]: "320px" }}>
          <g transform="translate(155 8)">
            <RunCat coat={lead} legPhase="0s" />
          </g>
        </g>
      </svg>
    </div>
  );
}

const CAT_CSS = `
.scat-run, .scat-leg, .scat-tail, .scat-body, .scat-blink { transform-box: fill-box; }
.scat-run  { transform-origin: center; animation: scat-run var(--scat-dur) ease-in-out infinite; }
.scat-leg  { transform-origin: 50% 6%; animation: scat-leg .42s linear infinite; }
.scat-tail { transform-origin: 90% 90%; animation: scat-tail .5s ease-in-out infinite; }
.scat-body { transform-origin: center; animation: scat-body .42s ease-in-out infinite; }
.scat-blink{ transform-origin: center; animation: scat-blink 3.4s ease-in-out infinite; }

/* ping-pong across the screen, flipping to face the run direction at each end */
@keyframes scat-run {
  0%    { transform: translateX(0)            scaleX(1);  }
  44%   { transform: translateX(var(--reach)) scaleX(1);  }
  50%   { transform: translateX(var(--reach)) scaleX(-1); }
  94%   { transform: translateX(0)            scaleX(-1); }
  100%  { transform: translateX(0)            scaleX(1);  }
}
/* gallop: legs swing fore/aft around the hip */
@keyframes scat-leg {
  0%   { transform: rotate(26deg);  }
  50%  { transform: rotate(-26deg); }
  100% { transform: rotate(26deg);  }
}
@keyframes scat-body {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-5px); }
}
@keyframes scat-tail {
  0%,100% { transform: rotate(-12deg); }
  50%     { transform: rotate(16deg); }
}
@keyframes scat-blink {
  0%,46%,51%,100% { transform: scaleY(1); }
  48.5%           { transform: scaleY(.1); }
}
@media (prefers-reduced-motion: reduce) {
  .scat-run, .scat-leg, .scat-tail, .scat-body, .scat-blink { animation: none !important; }
  .scat-run { transform: translateX(150px); }
}
`;
