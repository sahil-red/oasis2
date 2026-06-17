/**
 * Shared pooled Postgres connection for the search hot-path AND the snapshot
 * loaders. One pool per process/lambda over the native protocol — far faster than
 * a fresh TLS handshake per query or paginated PostgREST scans. prepare:false
 * because Supabase's transaction pooler rejects prepared statements.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

let _pool: Sql | null = null;

export async function getSearchPool(): Promise<Sql | null> {
  if (_pool) return _pool;
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) return null;
  const { default: postgres } = await import("postgres");
  _pool = postgres(dbUrl, { max: 8, idle_timeout: 30, connect_timeout: 10, prepare: false });
  return _pool;
}
