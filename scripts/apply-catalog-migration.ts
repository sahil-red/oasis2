#!/usr/bin/env -S pnpm tsx
/**
 * Apply catalog performance migration when SUPABASE_DB_URL is set.
 *   pnpm catalog:migrate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

async function main() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[catalog:migrate] Set SUPABASE_DB_URL in .env.local (Supabase → Settings → Database → URI)",
    );
    process.exit(1);
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sql = readFileSync(
    join(root, "supabase/migrations/0006_catalog_performance.sql"),
    "utf8",
  );

  const { default: postgres } = await import("postgres");
  const sqlClient = postgres(url, { max: 1 });

  try {
    await sqlClient.unsafe(sql);
    console.log("[catalog:migrate] applied 0006_catalog_performance.sql");
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
