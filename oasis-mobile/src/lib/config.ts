import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

/** Deployed Scout API base — no trailing slash. */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  extra?.apiUrl?.replace(/\/+$/, "") ||
  "http://localhost:3000";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
