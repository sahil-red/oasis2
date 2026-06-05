import { adminClient } from "@/lib/supabase/admin";
import { refreshZeptoToken, type ZeptoTokenSet } from "@/lib/zepto/oauth";

export type ZeptoConnection = {
  id: string;
  connection_key: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string | null;
};

export async function getZeptoConnection(connectionKey: string): Promise<ZeptoConnection | null> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("zepto_connections")
    .select("id, connection_key, access_token, refresh_token, expires_at, scopes")
    .eq("connection_key", connectionKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ZeptoConnection | null;
}

export async function upsertZeptoConnection(opts: {
  connectionKey: string;
  userId?: string | null;
  tokens: ZeptoTokenSet;
}): Promise<void> {
  const expiresAt =
    opts.tokens.expires_in != null
      ? new Date(Date.now() + opts.tokens.expires_in * 1000).toISOString()
      : null;

  const supabase = adminClient();
  const { error } = await supabase.from("zepto_connections").upsert(
    {
      connection_key: opts.connectionKey,
      user_id: opts.userId ?? null,
      access_token: opts.tokens.access_token,
      refresh_token: opts.tokens.refresh_token ?? null,
      expires_at: expiresAt,
      scopes: opts.tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_key" },
  );

  if (error) throw new Error(error.message);
}

export async function deleteZeptoConnection(connectionKey: string): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("zepto_connections")
    .delete()
    .eq("connection_key", connectionKey);
  if (error) throw new Error(error.message);
}

export async function getValidAccessToken(connection: ZeptoConnection): Promise<string> {
  const expiresMs = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : null;
  const stillValid = expiresMs == null || expiresMs > Date.now() + 60_000;

  if (stillValid) return connection.access_token;

  if (!connection.refresh_token) {
    throw new Error("Zepto session expired — connect again");
  }

  const refreshed = await refreshZeptoToken(connection.refresh_token);
  await upsertZeptoConnection({
    connectionKey: connection.connection_key,
    tokens: refreshed,
  });
  return refreshed.access_token;
}
