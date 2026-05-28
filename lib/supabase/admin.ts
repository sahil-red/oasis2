import { createClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch } from "undici";
import { normalizeSupabaseUrl } from "./url";

const connectMs = Number(process.env.SUPABASE_CONNECT_TIMEOUT_MS ?? 60_000);
const bodyMs = Number(process.env.SUPABASE_BODY_TIMEOUT_MS ?? 120_000);
const adminDispatcher = new Agent({
  connectTimeout: connectMs,
  headersTimeout: bodyMs,
  bodyTimeout: bodyMs,
});

/** Node default fetch uses 10s connect timeout; retry on flaky networks. */
async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const attempts = 5;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await undiciFetch(input as any, {
        ...init,
        dispatcher: adminDispatcher,
      } as Parameters<typeof undiciFetch>[1]);
      return res as unknown as Response;
    } catch (e) {
      last = e;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

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
    global: { fetch: adminFetch },
  });
}
