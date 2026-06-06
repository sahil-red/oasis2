import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

/** Production API — used for Expo Go worldwide (tunnel + public HTTPS). */
export const DEFAULT_API_BASE = "https://oasis-phi-one.vercel.app";

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isPrivateLanHost(host: string): boolean {
  return (
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Metro reports dev machine host (LAN IP when using --lan, not used for tunnel). */
function metroLanHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const host = raw.split(":")[0]?.trim();
    if (host && !isLoopbackHost(host) && isPrivateLanHost(host)) return host;
  }
  return null;
}

function portFromUrl(url: string, fallback = "3000"): string {
  try {
    return new URL(url).port || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve API base for this runtime.
 * Default: production HTTPS (anyone with the QR + internet).
 * Local only when EXPO_PUBLIC_MOBILE_API_MODE=local (same Wi‑Fi + pnpm dev:lan).
 */
function resolveApiBase(): string {
  const mode = process.env.EXPO_PUBLIC_MOBILE_API_MODE?.toLowerCase();
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
  const fromExtra = extra?.apiUrl?.replace(/\/+$/, "");
  let base = fromEnv || fromExtra || DEFAULT_API_BASE;

  if (__DEV__ && mode === "local" && isLoopbackUrl(base)) {
    const host = metroLanHost();
    if (host) {
      const port = portFromUrl(base);
      return `http://${host}:${port}`;
    }
  }

  // Never use private LAN URLs unless explicitly in local mode (tunnel users are off-LAN).
  if (__DEV__ && mode !== "local" && base.startsWith("http://")) {
    try {
      if (isPrivateLanHost(new URL(base).hostname)) return DEFAULT_API_BASE;
    } catch {
      return DEFAULT_API_BASE;
    }
  }

  return base;
}

/** Deployed Scout API base — no trailing slash. */
export const API_BASE = resolveApiBase();

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
