"use client";

import { useState } from "react";

/**
 * The 1–5s AI-search wait, made fun: a randomly-chosen vignette of two kittens —
 * chasing across the screen, pouncing on a ball of yarn, or napping (Zzz + a few
 * happy hearts). Pure inline SVG + CSS transforms — no deps, no images, no
 * network; vector-crisp at any size, GPU-cheap. Coats + scene randomise per
 * mount, so back-to-back searches never repeat. Respects reduced-motion.
 *
 * Positioning uses the SVG `transform` ATTRIBUTE; motion uses the CSS `transform`
 * PROPERTY on nested groups (separate nodes — CSS transform overrides the
 * attribute). transform-box:fill-box anchors every transform-origin to the
 * element's own box.
 */

type Coat = { body: string; belly: string; ear: string; line: string; stripe: string };

const COATS: Coat[] = [
  { body: "#e2904f", belly: "#f7e0c4", ear: "#e79bb0", stripe: "#c2702f", line: "rgba(70,40,15,.5)" }, // ginger tabby
  { body: "#9aa0a8", belly: "#eceae6", ear: "#e6a6ba", stripe: "#7b828b", line: "rgba(40,44,52,.5)" }, // grey
  { body: "#6e6962", belly: "#cdc6be", ear: "#caa0ad", stripe: "#565049", line: "rgba(18,18,22,.55)" }, // charcoal
  { body: "#dfd7ca", belly: "#fbf6ee", ear: "#e7a9bb", stripe: "#c4b9a6", line: "rgba(80,62,34,.42)" }, // cream
];

function pick<T>(a: T[], not = -1): [T, number] {
  let i = Math.floor(Math.random() * a.length);
  if (i === not) i = (i + 1) % a.length;
  return [a[i]!, i];
}

const S = (c: Coat) =>
  ({ "--cb": c.body, "--cl": c.belly, "--ce": c.ear, "--cs": c.stripe, "--cln": c.line }) as React.CSSProperties;
const COMMON = { stroke: "var(--cln)", strokeWidth: 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/* ───────────────────────── cat poses (local box ~150×110, feet y≈92) ───────────────────────── */

/** Running cat, side profile, facing right — for the chase. */
function CatRun({ coat, legClass }: { coat: Coat; legClass: string }) {
  return (
    <g style={S(coat)} {...COMMON}>
      <g className="cat-tailrun"><path d="M20 60 C-6 56 -12 24 8 12 C16 20 12 38 22 48 C27 53 31 58 33 64 Z" fill="var(--cb)" /></g>
      <g className={`cat-legrun ${legClass}`} style={{ ["--lp" as string]: "0s" }}>
        <path d="M36 70 C30 80 22 86 14 92" fill="none" strokeWidth="7" stroke="var(--cb)" />
        <path d="M118 70 C124 80 130 86 136 92" fill="none" strokeWidth="7" stroke="var(--cb)" />
      </g>
      <g className={`cat-legrun ${legClass}`} style={{ ["--lp" as string]: "-.2s" }}>
        <path d="M48 72 C44 82 38 88 32 92" fill="none" strokeWidth="7.5" stroke="var(--cs)" />
        <path d="M104 72 C108 82 114 88 120 92" fill="none" strokeWidth="7.5" stroke="var(--cs)" />
      </g>
      <g className="cat-bodyrun">
        <ellipse cx="44" cy="58" rx="30" ry="25" fill="var(--cb)" />
        <path d="M18 58 C12 40 30 31 58 31 C90 31 112 33 126 46 C130 57 120 66 102 67 C72 71 40 70 18 58 Z" fill="var(--cb)" />
        <path d="M30 70 C54 76 88 75 108 65 C104 73 84 79 60 78 C46 77 36 74 30 70 Z" fill="var(--cl)" stroke="none" />
        {/* head */}
        <circle cx="130" cy="40" r="14" fill="var(--cb)" />
        <path d="M140 38 C148 38 148 48 139 50 C135 47 135 41 140 38 Z" fill="var(--cb)" />
        <path d="M120 30 L116 13 L131 26 Z" fill="var(--cb)" />
        <path d="M137 28 L145 13 L132 26 Z" fill="var(--cb)" />
        <path d="M123 28 L121 18 L129 26 Z" fill="var(--ce)" stroke="none" />
        <path d="M137 26 L142 17 L133 26 Z" fill="var(--ce)" stroke="none" />
        <ellipse className="cat-blink" cx="131" cy="38" rx="2.3" ry="3.2" fill="var(--cln)" stroke="none" />
        <circle cx="145" cy="45" r="1.7" fill="var(--ce)" stroke="none" />
        <g stroke="var(--cln)" strokeWidth="1" opacity=".55"><path d="M142 47 L154 45" /><path d="M142 50 L153 52" /></g>
      </g>
    </g>
  );
}

/** Sitting cat, near-front 3/4 view — the watcher. */
function CatSit({ coat, className = "" }: { coat: Coat; className?: string }) {
  return (
    <g style={S(coat)} {...COMMON} className={className}>
      <g className="cat-tailflick"><path d="M86 96 C112 96 116 70 104 60 C100 70 96 84 80 86 Z" fill="var(--cb)" /></g>
      {/* body */}
      <path d="M40 96 C33 64 47 44 64 44 C81 44 95 64 88 96 Z" fill="var(--cb)" />
      <path d="M55 92 C50 74 55 60 64 60 C73 60 78 74 73 92 Z" fill="var(--cl)" stroke="none" />
      <ellipse cx="54" cy="95" rx="7" ry="5" fill="var(--cl)" />
      <ellipse cx="74" cy="95" rx="7" ry="5" fill="var(--cl)" />
      {/* head */}
      <circle cx="64" cy="34" r="20" fill="var(--cb)" />
      <path d="M47 22 L43 2 L62 18 Z" fill="var(--cb)" /><path d="M81 22 L85 2 L66 18 Z" fill="var(--cb)" />
      <path d="M50 19 L49 7 L59 17 Z" fill="var(--ce)" stroke="none" /><path d="M78 19 L79 7 L69 17 Z" fill="var(--ce)" stroke="none" />
      {/* cheek fluff */}
      <path d="M45 38 q-6 2 -7 7 q5 1 8 -2 Z" fill="var(--cb)" /><path d="M83 38 q6 2 7 7 q-5 1 -8 -2 Z" fill="var(--cb)" />
      <g className="cat-blink">
        <ellipse cx="56" cy="34" rx="3" ry="4.3" fill="var(--cln)" stroke="none" /><ellipse cx="72" cy="34" rx="3" ry="4.3" fill="var(--cln)" stroke="none" />
      </g>
      <path d="M61 41 L67 41 L64 45 Z" fill="var(--ce)" stroke="none" />
      <path d="M64 45 V47 M64 47 C62 49 59 48.5 58 47 M64 47 C66 49 69 48.5 70 47" fill="none" strokeWidth="1.3" />
      <g stroke="var(--cln)" strokeWidth="1" opacity=".5"><path d="M52 42 L38 40" /><path d="M52 45 L39 47" /><path d="M76 42 L90 40" /><path d="M76 45 L89 47" /></g>
    </g>
  );
}

/** Pouncing cat — play-bow, front paws down, haunches up, facing right. */
function CatPounce({ coat }: { coat: Coat }) {
  return (
    <g style={S(coat)} {...COMMON} className="cat-pounce">
      <g className="cat-tailflick" style={{ transformOrigin: "20px 50px" }}><path d="M22 52 C-2 44 -4 16 12 8 C18 16 14 32 26 42 Z" fill="var(--cb)" /></g>
      <ellipse cx="34" cy="54" rx="22" ry="22" fill="var(--cb)" />
      <path d="M16 60 C14 42 34 34 64 36 C96 38 116 52 120 70 C112 64 96 60 80 62 C70 56 40 70 16 60 Z" fill="var(--cb)" />
      {/* front legs stretched down */}
      <path d="M108 66 C112 78 114 86 114 92" fill="none" strokeWidth="7" stroke="var(--cb)" />
      <path d="M98 66 C100 78 100 86 100 92" fill="none" strokeWidth="7.5" stroke="var(--cs)" />
      {/* rear legs tucked */}
      <path d="M30 74 C26 84 22 88 18 92" fill="none" strokeWidth="7.5" stroke="var(--cs)" />
      <path d="M44 74 C42 84 40 88 38 92" fill="none" strokeWidth="7" stroke="var(--cb)" />
      {/* head low, facing the toy */}
      <circle cx="118" cy="62" r="13" fill="var(--cb)" />
      <path d="M127 62 C134 62 134 70 126 72 C123 69 123 64 127 62 Z" fill="var(--cb)" />
      <path d="M109 52 L106 38 L119 50 Z" fill="var(--cb)" /><path d="M125 51 L132 38 L120 50 Z" fill="var(--cb)" />
      <path d="M112 50 L111 41 L118 50 Z" fill="var(--ce)" stroke="none" />
      <ellipse cx="120" cy="61" rx="2.3" ry="3.2" fill="var(--cln)" stroke="none" />
      <circle cx="132" cy="67" r="1.6" fill="var(--ce)" stroke="none" />
    </g>
  );
}

/** Sleeping curled cat. */
function CatSleep({ coat }: { coat: Coat }) {
  return (
    <g style={S(coat)} {...COMMON} className="cat-breathe">
      <path d="M18 92 C8 70 24 48 56 48 C92 48 116 64 116 84 C116 94 104 96 92 94 C70 90 60 78 48 80 C36 82 40 94 28 94 C23 94 20 93 18 92 Z" fill="var(--cb)" />
      <path d="M30 90 C26 76 38 66 56 66 C80 66 96 74 100 86 C86 82 70 82 56 86 C46 89 38 92 30 90 Z" fill="var(--cl)" stroke="none" />
      {/* curled tail over the body */}
      <path d="M104 84 C118 82 120 68 110 64 C108 72 100 78 92 80 Z" fill="var(--cb)" />
      {/* head resting */}
      <circle cx="40" cy="74" r="17" fill="var(--cb)" />
      <path d="M27 64 L24 49 L39 62 Z" fill="var(--cb)" /><path d="M53 63 L58 49 L43 61 Z" fill="var(--cb)" />
      <path d="M30 62 L29 53 L37 61 Z" fill="var(--ce)" stroke="none" />
      {/* closed happy eyes */}
      <path d="M30 73 q5 4 10 0" fill="none" strokeWidth="1.6" /><path d="M44 73 q5 4 10 0" fill="none" strokeWidth="1.6" />
      <path d="M40 80 L44 80 L42 83 Z" fill="var(--ce)" stroke="none" />
      <g stroke="var(--cln)" strokeWidth="1" opacity=".5"><path d="M30 80 L18 79" /><path d="M54 80 L66 79" /></g>
    </g>
  );
}

/* ───────────────────────── props ───────────────────────── */
function Yarn({ className = "" }: { className?: string }) {
  return (
    <g className={className} stroke="rgba(0,0,0,.18)" strokeWidth="1.1" strokeLinecap="round">
      <circle cx="0" cy="0" r="12" fill="#cf5b4a" />
      <path d="M-10 -3 C-3 -10 5 -10 10 -2 M-11 3 C-4 8 7 9 11 1 M-7 -10 C0 -3 1 7 -3 11 M7 -10 C2 -2 3 7 8 10" fill="none" />
      <path d="M11 2 C20 4 18 11 25 11" fill="none" strokeWidth="1.3" />
    </g>
  );
}
function Butterfly({ className = "" }: { className?: string }) {
  return (
    <g className={className} stroke="rgba(0,0,0,.2)" strokeWidth="1">
      <g className="cat-flap">
        <path d="M0 0 C-12 -12 -18 -4 -14 4 C-10 10 -3 6 0 0 Z" fill="#e98bb6" />
        <path d="M0 0 C12 -12 18 -4 14 4 C10 10 3 6 0 0 Z" fill="#e98bb6" />
      </g>
      <ellipse cx="0" cy="0" rx="1.6" ry="5" fill="#5a4a3a" stroke="none" />
    </g>
  );
}
function Hearts({ className = "" }: { className?: string }) {
  const h = "M0 2 C-3 -2 -8 0 -8 4 C-8 8 0 12 0 12 C0 12 8 8 8 4 C8 0 3 -2 0 2 Z";
  return (
    <g className={className} fill="#e87a93">
      <path d={h} className="cat-heart" style={{ ["--hd" as string]: "0s" }} transform="translate(0 0) scale(.8)" />
      <path d={h} className="cat-heart" style={{ ["--hd" as string]: "-1.1s" }} transform="translate(12 -6) scale(.55)" />
      <path d={h} className="cat-heart" style={{ ["--hd" as string]: "-2.2s" }} transform="translate(-10 -4) scale(.45)" />
    </g>
  );
}
function Zzz({ className = "" }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="var(--color-fg-dim)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
      <path className="cat-zzz" style={{ ["--zd" as string]: "0s" }} d="M0 14 L8 14 L0 22 L8 22" transform="translate(0 0) scale(.7)" />
      <path className="cat-zzz" style={{ ["--zd" as string]: "-1s" }} d="M0 14 L8 14 L0 22 L8 22" transform="translate(10 -10) scale(.9)" />
      <path className="cat-zzz" style={{ ["--zd" as string]: "-2s" }} d="M0 14 L8 14 L0 22 L8 22" transform="translate(22 -22) scale(1.1)" />
    </g>
  );
}
function Dust({ x }: { x: number }) {
  return (
    <g className="cat-dust" transform={`translate(${x} 150)`} fill="var(--color-line-strong)" stroke="none" opacity="0">
      <circle cx="0" cy="0" r="6" /><circle cx="10" cy="-4" r="4" /><circle cx="-9" cy="-3" r="3.5" />
    </g>
  );
}

/* ───────────────────────── scenes ───────────────────────── */
function SceneChase({ a, b }: { a: Coat; b: Coat }) {
  return (
    <>
      <Dust x={120} /><Dust x={420} />
      <g className="cat-speed" stroke="var(--color-line-strong)" strokeWidth="2.5" strokeLinecap="round" opacity=".4">
        <path d="M150 70 H120" /><path d="M150 86 H126" />
      </g>
      <g className="cat-run" style={{ ["--reach" as string]: "300px" }}>
        <g transform="translate(20 30) scale(1.15)"><CatRun coat={b} legClass="" /></g>
      </g>
      <g className="cat-run" style={{ ["--reach" as string]: "300px" }}>
        <g transform="translate(195 30) scale(1.15)"><CatRun coat={a} legClass="cat-legrun2" /></g>
      </g>
    </>
  );
}
function SceneYarn({ a, b }: { a: Coat; b: Coat }) {
  return (
    <>
      <g transform="translate(70 24) scale(1.15)"><CatPounce coat={a} /></g>
      <g transform="translate(250 150)"><Yarn className="cat-yarn" /></g>
      <g transform="translate(470 36) scale(1.15)"><CatSit coat={b} /></g>
      <g transform="translate(520 30)"><Hearts className="cat-hearts" /></g>
    </>
  );
}
function SceneNap({ a, b }: { a: Coat; b: Coat }) {
  return (
    <>
      <g transform="translate(120 56) scale(1.2)"><CatSleep coat={a} /></g>
      <g transform="translate(150 30)"><Zzz className="cat-zzzwrap" /></g>
      <g transform="translate(470 40) scale(1.15)"><CatSit coat={b} /></g>
      <g transform="translate(440 90)"><Butterfly className="cat-bfly" /></g>
    </>
  );
}

const SCENES = [SceneChase, SceneYarn, SceneNap];

export function SearchCats({ className = "" }: { className?: string }) {
  const [{ Scene, a, b, dur }] = useState(() => {
    const [a, ai] = pick(COATS);
    const [b] = pick(COATS, ai);
    const [Scene] = pick(SCENES);
    return { Scene, a, b, dur: 4.4 + Math.random() * 1.6 };
  });
  return (
    <div className={`w-full ${className}`} aria-hidden>
      <style>{CAT_CSS}</style>
      <svg viewBox="0 0 760 200" className="mx-auto h-auto w-full max-w-[680px]" style={{ ["--scat-dur" as string]: `${dur}s` }}>
        <line x1="40" y1="182" x2="720" y2="182" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="2 12" strokeLinecap="round" />
        <Scene a={a} b={b} />
      </svg>
    </div>
  );
}

const CAT_CSS = `
.cat-run,.cat-legrun,.cat-bodyrun,.cat-tailrun,.cat-tailflick,.cat-blink,.cat-breathe,.cat-pounce,.cat-yarn,.cat-heart,.cat-hearts,.cat-zzz,.cat-bfly,.cat-flap,.cat-dust,.cat-speed { transform-box: fill-box; }

/* chase */
.cat-run   { transform-origin: center; animation: cat-run var(--scat-dur) ease-in-out infinite; }
.cat-bodyrun { transform-origin: center; animation: cat-bob .34s ease-in-out infinite; }
.cat-legrun  { transform-origin: 50% 8%; animation: cat-leg .34s ease-in-out infinite var(--lp,0s); }
.cat-legrun2 .cat-legrun { animation-delay: calc(var(--lp,0s) - .17s); }
.cat-tailrun { transform-origin: 90% 80%; animation: cat-tailrun .5s ease-in-out infinite; }
.cat-speed   { animation: cat-speed var(--scat-dur) ease-in-out infinite; }
.cat-dust    { animation: cat-dust 1.1s ease-out infinite; }

/* shared */
.cat-blink  { transform-origin: center; animation: cat-blink 3.6s ease-in-out infinite; }
.cat-tailflick { transform-origin: 20% 90%; animation: cat-tailflick 2.4s ease-in-out infinite; }
.cat-breathe { transform-origin: 50% 100%; animation: cat-breathe 3.2s ease-in-out infinite; }

/* yarn play */
.cat-pounce { transform-origin: 50% 100%; animation: cat-pounce 1.9s cubic-bezier(.5,0,.4,1) infinite; }
.cat-yarn   { transform-origin: center; animation: cat-yarn 1.9s cubic-bezier(.5,0,.4,1) infinite; }
.cat-hearts { animation: cat-fadeloop 4s ease-in-out infinite; }
.cat-heart  { transform-origin: center; animation: cat-heart 3.3s ease-out infinite var(--hd,0s); }

/* nap */
.cat-zzz    { transform-origin: center; animation: cat-zzz 3s ease-out infinite var(--zd,0s); }
.cat-bfly   { animation: cat-bfly 5s ease-in-out infinite; }
.cat-flap   { transform-origin: center; animation: cat-flap .25s ease-in-out infinite; }

@keyframes cat-run { 0%{transform:translateX(0) scaleX(1)} 44%{transform:translateX(var(--reach)) scaleX(1)} 50%{transform:translateX(var(--reach)) scaleX(-1)} 94%{transform:translateX(0) scaleX(-1)} 100%{transform:translateX(0) scaleX(1)} }
@keyframes cat-bob { 0%,100%{transform:translateY(0) scaleX(1)} 50%{transform:translateY(-7px) scaleX(1.04)} }
@keyframes cat-leg { 0%{transform:rotate(28deg)} 50%{transform:rotate(-28deg)} 100%{transform:rotate(28deg)} }
@keyframes cat-tailrun { 0%,100%{transform:rotate(-14deg)} 50%{transform:rotate(14deg)} }
@keyframes cat-speed { 0%,40%,100%{opacity:0} 5%,30%{opacity:.4} 50%,90%{opacity:0} 55%,80%{opacity:.4} }
@keyframes cat-dust { 0%{opacity:0;transform:translateY(0) scale(.5)} 30%{opacity:.5} 100%{opacity:0;transform:translateY(-10px) scale(1.4)} }

@keyframes cat-blink { 0%,45%,50%,100%{transform:scaleY(1)} 47.5%{transform:scaleY(.1)} }
@keyframes cat-tailflick { 0%,100%{transform:rotate(8deg)} 25%{transform:rotate(-10deg)} 50%{transform:rotate(6deg)} }
@keyframes cat-breathe { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.04)} }

@keyframes cat-pounce { 0%,18%{transform:translate(0,0) rotate(0)} 40%{transform:translate(60px,4px) rotate(2deg)} 55%{transform:translate(120px,2px) rotate(0)} 70%,100%{transform:translate(0,0) rotate(0)} }
@keyframes cat-yarn { 0%,18%{transform:translate(0,0) rotate(0) scale(1)} 50%{transform:translate(60px,0) rotate(240deg) scale(1.05)} 70%{transform:translate(120px,0) rotate(360deg) scale(1)} 71%,100%{transform:translate(0,0) rotate(0) scale(1)} }
@keyframes cat-fadeloop { 0%,15%,100%{opacity:0} 35%,80%{opacity:1} }
@keyframes cat-heart { 0%{opacity:0;transform:translateY(6px) scale(.4)} 30%{opacity:.9} 100%{opacity:0;transform:translateY(-22px) scale(1)} }

@keyframes cat-zzz { 0%{opacity:0;transform:translateY(6px) scale(.6)} 30%{opacity:.8} 100%{opacity:0;transform:translateY(-16px) scale(1.1)} }
@keyframes cat-bfly { 0%{transform:translate(0,0)} 25%{transform:translate(-40px,-26px)} 50%{transform:translate(-72px,6px)} 75%{transform:translate(-30px,-30px)} 100%{transform:translate(0,0)} }
@keyframes cat-flap { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(.4)} }

@media (prefers-reduced-motion: reduce) {
  .cat-run,.cat-legrun,.cat-bodyrun,.cat-tailrun,.cat-tailflick,.cat-blink,.cat-breathe,.cat-pounce,.cat-yarn,.cat-heart,.cat-hearts,.cat-zzz,.cat-bfly,.cat-flap,.cat-dust,.cat-speed { animation: none !important; }
  .cat-run { transform: translateX(150px); }
  .cat-hearts,.cat-heart,.cat-zzz { opacity: .7; }
}
`;
