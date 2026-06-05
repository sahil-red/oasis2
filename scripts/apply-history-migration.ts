#!/usr/bin/env -S pnpm tsx
import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.SUPABASE_DB_URL!);
  const migration = readFileSync("supabase/migrations/0012_history.sql", "utf8");
  try {
    await sql.unsafe(migration);
    console.log("0012_history.sql applied ✓");
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("already exists")) console.log("Already applied ✓");
    else { console.error("Error:", msg); process.exit(1); }
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
