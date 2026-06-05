export const ZEPTO_CONN_COOKIE = "scout_zepto_conn";
export const ZEPTO_OAUTH_COOKIE = "scout_zepto_oauth";

export type ZeptoOAuthPending = {
  state: string;
  verifier: string;
  connectionKey: string;
  returnTo?: string;
};

export function parseOAuthPendingCookie(raw: string | undefined): ZeptoOAuthPending | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ZeptoOAuthPending;
    if (!parsed.state || !parsed.verifier || !parsed.connectionKey) return null;
    return parsed;
  } catch {
    return null;
  }
}
