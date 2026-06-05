import { Easing } from "react-native-reanimated";

export const motion = {
  /** Default UI spring — cards, modals, panels */
  spring: { damping: 18, stiffness: 180, mass: 1 },
  /** Soft spring — large surfaces like verdict card, hero */
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  /** Snappy spring — press feedback */
  springSnappy: { damping: 16, stiffness: 260, mass: 0.8 },
  /** Standard ease-out timing */
  timing: { duration: 280, easing: Easing.out(Easing.cubic) },
  /** Fast ease-out timing — micro-interactions */
  timingFast: { duration: 160, easing: Easing.out(Easing.cubic) },
  /** Stagger step per list item (ms). Cap index at ~8 to keep total under 360ms. */
  stagger: 45,
} as const;
