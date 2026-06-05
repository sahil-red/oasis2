import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

/** Production API — used when EXPO_PUBLIC_API_URL is unset (Expo Go cannot reach localhost). */
export const DEFAULT_API_BASE = "https://oasis-phi-one.vercel.app";

/** Deployed Scout API base — no trailing slash. */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  extra?.apiUrl?.replace(/\/+$/, "") ||
  DEFAULT_API_BASE;

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
