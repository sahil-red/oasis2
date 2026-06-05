/** Scout mobile — warm dark palette aligned with web dark mode. */
export const colors = {
  bg: "#0a0a0b",
  bgSoft: "#141416",
  panel: "#1c1c1e",
  panel2: "#242428",
  line: "rgba(255,255,255,0.1)",
  lineStrong: "rgba(255,255,255,0.18)",
  fg: "#f5f5f7",
  fgMuted: "#a1a1a6",
  fgDim: "#86868b",
  accent: "#e8a54b",
  accentSoft: "rgba(232, 165, 75, 0.15)",
  good: "#34d399",
  warn: "#fbbf24",
  bad: "#f87171",
  scoreExcellent: "#24a66f",
  scoreGood: "#8a9f39",
  scorePoor: "#c9842f",
  scoreBad: "#c85f5f",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  hero: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.3 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: "500" as const },
  micro: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.3 },
};
