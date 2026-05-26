#!/usr/bin/env -S pnpm tsx
/**
 * Apply all SQL migrations in order (0001–0006).
 *   pnpm tsx scripts/apply-all-migrations.ts
 *
 * Requires SUPABASE_DB_URL in .env.local (Session pooler URI).
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
  console.error(e);
  process.exit(1);
});
