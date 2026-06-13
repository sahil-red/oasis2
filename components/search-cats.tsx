"use client";

import { useState } from "react";

/**
 * A little distraction for the 1–5s AI-search wait: two kittens batting a ball
 * of yarn back and forth. Pure SVG + CSS transforms (no deps, no network), so it
 * stays crisp at any size and themes for free. Colours, yarn and tempo are
 * randomised per mount, so two searches in a row never look the same.
 *
 * Positioning uses the SVG `transform` ATTRIBUTE; motion uses the CSS `transform`
 * PROPERTY on nested groups — they must stay on separate elements (CSS transform
 * overrides the attribute on the same node). transform-box:fill-box makes every
 * transform-origin refer to the element's own box. Respects reduced-motion.
 */

type Coat = { body: string; belly: string; ear: string; line: string };

const COATS: Coat[] = [
  { body: "#e2904f", belly: "#f6dcbd", ear: "#c76f37", line: "rgba(70,40,15,.42)" }, // ginger tabby
  { body: "#9ea4ab", belly: "#eceae6", ear: "#7c828a", line: "rgba(35,38,45,.40)" }, // grey
  { body: "#ecdcc2", belly: "#fbf4e8", ear: "#d8c3a0", line: "rgba(80,58,28,.38)" }, // cream
  { body: "#736d66", belly: "#d0c9c1", ear: "#565049", line: "rgba(18,18,22,.45)" }, // charcoal
  { body: "#e7b06f", belly: "#f8ecd6", ear: "#aa7440", line: "rgba(75,48,20,.42)" }, // butterscotch
];

const YARNS = ["#cf5b4a", "#d98aa0", "#6f98c6", "#7aa05a", "#c98a2e"];

function pick<T>(arr: T[], notIndex = -1): [T, number] {
  let i = Math.floor(Math.random() * arr.length);
  if (i === notIndex) i = (i + 1) % arr.length;
  return [arr[i]!, i];
}

/** One kitten, facing right, base of the sit at (64,132), head centred (64,61). */
function Kitten({ coat, blinkDelay, tailDelay }: { coat: Coat; blinkDelay: string; tailDelay: string }) {
  return (
    <g
      style={
        {
          "--cb": coat.body,
          "--cl": coat.belly,
          "--ce": coat.ear,
          "--cln": coat.line,
        } as React.CSSProperties
      }
      stroke="var(--cln)"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* tail — swishes from its base on the cat's back */}
      <g className="scat-tail" style={{ animationDelay: tailDelay }}>
        <path d="M41 120 C16 118 12 92 26 82 C30 90 30 102 44 110 Z" fill="var(--cb)" />
      </g>
      {/* body (sitting teardrop) */}
      <path d="M40 133 C33 101 46 79 64 79 C82 79 95 101 88 133 Z" fill="var(--cb)" />
      {/* lighter belly */}
      <path d="M57 130 C52 112 56 98 64 98 C72 98 76 112 71 130 Z" fill="var(--cl)" stroke="none" />
      {/* front paws */}
      <ellipse cx="55" cy="131" rx="7" ry="5.5" fill="var(--cl)" />
      <ellipse cx="73" cy="131" rx="7" ry="5.5" fill="var(--cl)" />
      {/* head */}
      <circle cx="64" cy="61" r="20" fill="var(--cb)" />
      {/* ears */}
      <path d="M47 49 L44 28 L62 44 Z" fill="var(--cb)" />
      <path d="M81 49 L84 28 L66 44 Z" fill="var(--cb)" />
      <path d="M50 46 L49 35 L59 44 Z" fill="var(--ce)" stroke="none" />
      <path d="M78 46 L79 35 L69 44 Z" fill="var(--ce)" stroke="none" />
      {/* eyes — blink */}
      <g className="scat-blink" style={{ animationDelay: blinkDelay }}>
        <ellipse cx="57" cy="60" rx="2.6" ry="4.2" fill="var(--cln)" stroke="none" />
        <ellipse cx="71" cy="60" rx="2.6" ry="4.2" fill="var(--cln)" stroke="none" />
      </g>
      {/* nose + mouth */}
      <path d="M61 67 L67 67 L64 70.5 Z" fill="var(--ce)" stroke="none" />
      <path d="M64 70.5 V73 M64 73 C62 75 59.5 74.5 58.5 73 M64 73 C66 75 68.5 74.5 69.5 73" fill="none" strokeWidth="1.4" />
      {/* whiskers */}
      <g stroke="var(--cln)" strokeWidth="1.1" opacity="0.6">
        <path d="M52 64 L38 62" />
        <path d="M52 67 L39 69" />
        <path d="M76 64 L90 62" />
        <path d="M76 67 L89 69" />
      </g>
    </g>
  );
}

function Yarn({ color }: { color: string }) {
  const dark = "rgba(0,0,0,.18)";
  return (
    <g stroke={dark} strokeWidth="1.1" strokeLinecap="round">
      <circle cx="0" cy="0" r="11" fill={color} />
      <path d="M-9 -3 C-3 -9 4 -9 9 -2" fill="none" />
      <path d="M-10 2 C-4 7 6 8 10 1" fill="none" />
      <path d="M-6 -9 C0 -3 1 6 -3 10" fill="none" />
      <path d="M6 -9 C2 -2 3 6 7 9" fill="none" />
      {/* loose tail strand */}
      <path d="M10 1 C18 3 16 9 22 9" fill="none" strokeWidth="1.3" />
    </g>
  );
}

export function SearchCats({ className = "" }: { className?: string }) {
  // Lock in a random cast for the lifetime of this mount (one search).
  const [{ left, right, yarn, dur }] = useState(() => {
    const [a, ai] = pick(COATS);
    const [b] = pick(COATS, ai);
    const [y] = pick(YARNS);
    return { left: a, right: b, yarn: y, dur: 3.3 + Math.random() * 0.9 };
  });

  return (
    <div className={`mx-auto w-full max-w-[300px] ${className}`} aria-hidden>
      <style>{CAT_CSS}</style>
      <svg viewBox="0 0 340 150" className="h-auto w-full" style={{ ["--scat-dur" as string]: `${dur}s` }}>
        {/* soft ground shadows under each cat */}
        <ellipse cx="100" cy="140" rx="40" ry="7" fill="rgba(60,40,20,.10)" />
        <ellipse cx="240" cy="140" rx="40" ry="7" fill="rgba(60,40,20,.10)" />
        {/* travelling shadow under the yarn */}
        <g transform="translate(100 141)">
          <ellipse className="scat-ball-sh" cx="0" cy="0" rx="13" ry="4" fill="rgba(60,40,20,.16)" />
        </g>

        {/* left cat */}
        <g transform="translate(36 8)">
          <g className="scat-bat-l">
            <Kitten coat={left} blinkDelay="0s" tailDelay="0s" />
          </g>
        </g>
        {/* right cat (mirrored) */}
        <g transform="translate(304 8) scale(-1 1)">
          <g className="scat-bat-r">
            <Kitten coat={right} blinkDelay="-2.1s" tailDelay="-0.8s" />
          </g>
        </g>

        {/* yarn — positioned by attribute, animated by CSS on the inner group */}
        <g transform="translate(100 118)">
          <g className="scat-ball">
            <Yarn color={yarn} />
          </g>
        </g>
      </svg>
    </div>
  );
}

const CAT_CSS = `
.scat-ball, .scat-ball-sh, .scat-bat-l, .scat-bat-r, .scat-tail, .scat-blink { transform-box: fill-box; }
.scat-ball { transform-origin: center; animation: scat-ball var(--scat-dur) cubic-bezier(.4,0,.6,1) infinite; }
.scat-ball-sh { transform-origin: center; animation: scat-ball-sh var(--scat-dur) cubic-bezier(.4,0,.6,1) infinite; }
.scat-bat-l { transform-origin: 50% 100%; animation: scat-bat-l var(--scat-dur) ease-in-out infinite; }
.scat-bat-r { transform-origin: 50% 100%; animation: scat-bat-r var(--scat-dur) ease-in-out infinite; }
.scat-tail { transform-origin: 90% 100%; animation: scat-tail 1.7s ease-in-out infinite; }
.scat-blink { transform-origin: center; animation: scat-blink 4.6s ease-in-out infinite; }

@keyframes scat-ball {
  0%   { transform: translate(0px,0px) rotate(0deg) scale(1.16,.84); }
  7%   { transform: translate(18px,-28px) rotate(42deg) scale(1,1); }
  25%  { transform: translate(70px,-66px) rotate(150deg) scale(.94,1.06); }
  43%  { transform: translate(128px,-28px) rotate(292deg) scale(1,1); }
  50%  { transform: translate(160px,2px) rotate(360deg) scale(1.16,.84); }
  57%  { transform: translate(128px,-28px) rotate(430deg) scale(1,1); }
  75%  { transform: translate(70px,-66px) rotate(560deg) scale(.94,1.06); }
  93%  { transform: translate(18px,-28px) rotate(680deg) scale(1,1); }
  100% { transform: translate(0px,0px) rotate(720deg) scale(1.16,.84); }
}
@keyframes scat-ball-sh {
  0%   { transform: translate(0px,0) scaleX(1.1); opacity:.16; }
  25%  { transform: translate(70px,0) scaleX(.45); opacity:.06; }
  50%  { transform: translate(160px,0) scaleX(1.1); opacity:.16; }
  75%  { transform: translate(82px,0) scaleX(.45); opacity:.06; }
  100% { transform: translate(0px,0) scaleX(1.1); opacity:.16; }
}
@keyframes scat-bat-l {
  0%,4%    { transform: rotate(-9deg) translateY(-2px); }
  12%,88%  { transform: rotate(0deg) translateY(0); }
  97%,100% { transform: rotate(-9deg) translateY(-2px); }
}
@keyframes scat-bat-r {
  0%,40%   { transform: rotate(0deg) translateY(0); }
  47%,53%  { transform: rotate(-9deg) translateY(-2px); }
  61%,100% { transform: rotate(0deg) translateY(0); }
}
@keyframes scat-tail {
  0%,100% { transform: rotate(-11deg); }
  50%     { transform: rotate(13deg); }
}
@keyframes scat-blink {
  0%,42%,47%,91%,96%,100% { transform: scaleY(1); }
  44.5%,93.5%             { transform: scaleY(.1); }
}
@media (prefers-reduced-motion: reduce) {
  .scat-ball, .scat-ball-sh, .scat-bat-l, .scat-bat-r, .scat-tail, .scat-blink { animation: none !important; }
  .scat-ball { transform: translate(80px,-66px); }
}
`;
