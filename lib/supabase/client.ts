import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./url";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  rawUrl && anon
    ? createClient(normalizeSupabaseUrl(rawUrl), anon)
    : null;

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Supabase env not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }
  return supabase;
}
