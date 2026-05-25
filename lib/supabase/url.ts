/**
 * Normalise NEXT_PUBLIC_SUPABASE_URL before passing to @supabase/supabase-js.
 *
 * PGRST125 ("Invalid path specified in request URL") often means the URL was
 * pasted with an extra `/rest/v1` suffix or a trailing slash — the JS client
 * already appends `/rest/v1`, so doubling it breaks every request.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;

  // Strip accidental REST suffix (common copy-paste mistake).
  url = url.replace(/\/rest\/v1\/?$/i, "");
  // Strip trailing slashes.
  url = url.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must start with https:// (got "${raw.slice(0, 40)}…")`,
    );
  }
  if (!/\.supabase\.co$/i.test(new URL(url).hostname)) {
    console.warn(
      `[supabase] URL host is "${new URL(url).hostname}" — expected *.supabase.co. ` +
        "Double-check you copied Project URL from Settings → API, not the dashboard link.",
    );
  }
  return url;
}
