import { createHash, randomBytes } from "node:crypto";

export const ZEPTO_MCP_RESOURCE = "https://mcp.zepto.co.in";
export const ZEPTO_MCP_URL = `${ZEPTO_MCP_RESOURCE}/mcp`;
export const ZEPTO_OAUTH_SCOPES = "tools:read tools:write";

type AuthServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
};

let cachedMeta: AuthServerMetadata | null = null;

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(16).toString("base64url");
}

async function fetchAuthServerMetadata(): Promise<AuthServerMetadata> {
  if (cachedMeta) return cachedMeta;

  const resourceRes = await fetch(`${ZEPTO_MCP_RESOURCE}/.well-known/oauth-protected-resource`);
  if (!resourceRes.ok) {
    throw new Error("Could not load Zepto MCP OAuth metadata");
  }
  const resource = (await resourceRes.json()) as {
    authorization_servers?: string[];
  };
  const authBase = resource.authorization_servers?.[0];
  if (!authBase) throw new Error("Zepto authorization server not listed");

  const metaRes = await fetch(
    `${authBase.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
  );
  if (!metaRes.ok) {
    throw new Error("Could not load Zepto authorization server metadata");
  }
  cachedMeta = (await metaRes.json()) as AuthServerMetadata;
  return cachedMeta;
}

export function siteOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function zeptoRedirectUri(): string {
  const override = process.env.ZEPTO_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;
  return `${siteOrigin()}/api/zepto/oauth/callback`;
}

export async function registerZeptoOAuthClient(redirectUri: string): Promise<{
  client_id: string;
}> {
  const meta = await fetchAuthServerMetadata();
  if (!meta.registration_endpoint) {
    throw new Error("Zepto does not expose dynamic client registration");
  }

  const res = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Scout",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zepto client registration failed: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { client_id: string };
  if (!data.client_id) throw new Error("Zepto client registration returned no client_id");
  return { client_id: data.client_id };
}

export function resolveZeptoClientId(): string {
  const id = process.env.ZEPTO_OAUTH_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      "ZEPTO_OAUTH_CLIENT_ID is not set. Run: pnpm zepto:oauth:register and add the client id to .env.local",
    );
  }
  return id;
}

export async function buildZeptoAuthorizationUrl(opts: {
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const meta = await fetchAuthServerMetadata();
  const clientId = resolveZeptoClientId();
  const redirectUri = zeptoRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ZEPTO_OAUTH_SCOPES,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    resource: ZEPTO_MCP_RESOURCE,
  });

  return `${meta.authorization_endpoint}?${params.toString()}`;
}

export type ZeptoTokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function exchangeZeptoCode(opts: {
  code: string;
  codeVerifier: string;
}): Promise<ZeptoTokenSet> {
  const meta = await fetchAuthServerMetadata();
  const clientId = resolveZeptoClientId();
  const redirectUri = zeptoRedirectUri();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: opts.codeVerifier,
    resource: ZEPTO_MCP_RESOURCE,
  });

  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zepto token exchange failed: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as ZeptoTokenSet;
}

export async function refreshZeptoToken(refreshToken: string): Promise<ZeptoTokenSet> {
  const meta = await fetchAuthServerMetadata();
  const clientId = resolveZeptoClientId();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    resource: ZEPTO_MCP_RESOURCE,
  });

  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zepto token refresh failed: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as ZeptoTokenSet;
}
