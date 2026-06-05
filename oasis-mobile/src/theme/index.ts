/** Scout palettes — match web globals.css light + html.dark */

export const darkColors = {
  bg: "#0a0a0b",
  bgSoft: "#141416",
  panel: "#1c1c1e",
  panel2: "#242428",
  line: "rgba(255,255,255,0.1)",
  lineStrong: "rgba(255,255,255,0.18)",
  fg: "#f5f5f7",
  fgMuted: "#a1a1a6",
  fgDim: "#86868b",
  accent: "#2997ff",
  accentSoft: "rgba(41, 151, 255, 0.18)",
  good: "#34d399",
  warn: "#fbbf24",
  bad: "#f87171",
  scoreExcellent: "#24a66f",
  scoreGood: "#8a9f39",
  scorePoor: "#c9842f",
  scoreBad: "#c85f5f",
} as const;

export const lightColors = {
  bg: "#faf7f2",
  bgSoft: "#f1ece2",
  panel: "#fbf9f4",
  panel2: "#f1ece2",
  line: "rgba(60, 40, 20, 0.10)",
  lineStrong: "rgba(60, 40, 20, 0.18)",
  fg: "#1c1612",
  fgMuted: "#5e544b",
  fgDim: "#8a7f74",
  accent: "#b45309",
  accentSoft: "rgba(180, 83, 9, 0.10)",
  good: "#15803d",
  warn: "#b45309",
  bad: "#991b1b",
  scoreExcellent: "#16a34a",
  scoreGood: "#84a822",
  scorePoor: "#d97706",
  scoreBad: "#dc2626",
} as const;

export type ThemeColors = {
  [K in keyof typeof darkColors]: string;
};

/** @deprecated use useTheme().colors */
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

export const fonts = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  display: "InstrumentSerif_400Regular",
  displayItalic: "InstrumentSerif_400Regular_Italic",
} as const;

export const typography = {
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase" as const,
  },
  hero: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  heroAccent: {
    fontFamily: fonts.displayItalic,
    fontStyle: "italic" as const,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  micro: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.3,
  },
};
