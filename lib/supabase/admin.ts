import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./url";

export function adminClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error(
      "Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const url = normalizeSupabaseUrl(rawUrl);
  if (url !== rawUrl.trim().replace(/\/+$/, "")) {
    console.warn(
      "[supabase] normalized NEXT_PUBLIC_SUPABASE_URL (removed /rest/v1 or trailing slash). " +
        "Update .env.local to just: https://<project-ref>.supabase.co",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
