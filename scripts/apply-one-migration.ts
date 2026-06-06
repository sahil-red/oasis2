#!/usr/bin/env -S pnpm tsx
/** Apply a single migration file by name. Usage: pnpm tsx scripts/apply-one-migration.ts 0017_search_v2_llm_embeddings */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("pass a migration name fragment, e.g. 0017");
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL missing");

  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase/migrations");
  const file = readdirSync(dir).filter((f) => f.endsWith(".sql") && f.includes(target)).sort()[0];
  if (!file) throw new Error(`no migration matching ${target}`);

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    const before = await sql`
      select a.attname, format_type(a.atttypid, a.atttypmod) as type
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relname = 'product_search_index' and a.attname in ('embedding','type_embedding')`;
    console.log("[before]", JSON.stringify(before));

    console.log(`[apply] ${file}…`);
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    console.log(`[apply] ✓ ${file}`);

    const after = await sql`
      select a.attname, format_type(a.atttypid, a.atttypmod) as type
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relname = 'product_search_index' and a.attname in ('embedding','type_embedding')`;
    console.log("[after]", JSON.stringify(after));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
