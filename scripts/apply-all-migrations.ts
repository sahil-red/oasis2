#!/usr/bin/env -S pnpm tsx
/**
 * Apply all SQL migrations in order.
 *   pnpm db:migrate
 *
 * Requires SUPABASE_DB_URL in .env.local (Supabase **Session pooler** URI).
 * Do not use a bare localhost postgres URL unless you run Supabase locally
 * with the matching password from `supabase start`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

async function main() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[migrate] Set SUPABASE_DB_URL in .env.local (Supabase → Settings → Database → Session pooler URI)",
    );
    process.exit(1);
  }

  try {
    const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
    const source = process.env.SUPABASE_DB_URL ? "SUPABASE_DB_URL" : "DATABASE_URL";
    console.log(
      `[migrate] ${source} → user=${u.username} host=${u.hostname} port=${u.port || "5432"} db=${u.pathname.replace(/^\//, "") || "postgres"}`,
    );
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      console.warn(
        "[migrate] Warning: localhost DB — use only if `supabase start` is running with this password, or point SUPABASE_DB_URL at your cloud project pooler.",
      );
    }
  } catch {
    console.warn("[migrate] Could not parse DB URL for diagnostics (check format).");
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { default: postgres } = await import("postgres");
  const sqlClient = postgres(url, { max: 1 });

  try {
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8");
      console.log(`[migrate] applying ${file}…`);
      await sqlClient.unsafe(sql);
      console.log(`[migrate] ✓ ${file}`);
    }
    console.log(`[migrate] done (${files.length} files)`);
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((e) => {
  const err = e as { code?: string; message?: string };
  if (err.code === "28P01") {
    console.error("\n[migrate] Password authentication failed.");
    console.error("  Fix SUPABASE_DB_URL in .env.local:");
    console.error("  1. Supabase Dashboard → Project Settings → Database");
    console.error("  2. Connection string → URI → mode **Session pooler** (IPv4)");
    console.error("  3. Replace [YOUR-PASSWORD] with the database password (Reset if unknown)");
    console.error("  4. URL must look like: postgresql://postgres.[ref]:[password]@aws-0-….pooler.supabase.com:5432/postgres");
    console.error("\n  Or paste supabase/migrations/0008_scoring_v9_foundations.sql into SQL Editor (no CLI).");
  } else {
    console.error(e);
  }
  process.exit(1);
});
