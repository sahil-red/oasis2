#!/usr/bin/env -S pnpm tsx
/**
 * Walks the platform's full taxonomy and persists it.
 *
 *   GROCERY_PLATFORM=blinkit pnpm tsx scripts/01-scrape-categories.ts
 *
 * What we save:
 *   • `zepto_taxonomy` table — one row per (super_category, category, subcategory).
 *     The name is legacy; the table is platform-agnostic.
 *   • `data/raw/<platform>-taxonomy.jsonl` — full raw payloads for offline
 *     re-extraction if Blinkit drops fields.
 *
 * Flags:
 *   --dry-run   Skip Supabase; just write to JSONL.
 *   --limit=N   Stop after N categories (useful while debugging).
 */

import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  getAdapter,
  loadSession,
  platformFromEnv,
} from "@/lib/grocery";
import type { ScrapedCategory } from "@/lib/grocery";
import { adminClient } from "@/lib/supabase/admin";

loadEnv({ path: ".env.local" });

const RAW_DIR = "data/raw";

interface Args {
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return { dryRun: argv.includes("--dry-run"), limit };
}

async function main() {
  const { dryRun, limit } = parseArgs();
  const platform = platformFromEnv();
  const session = await loadSession(platform);
  if (!session) {
    console.error(
      `[01-scrape-categories] no session for "${platform}". ` +
        `Run scripts/00-warm-session.ts first.`,
    );
    process.exit(1);
  }

  const adapter = getAdapter(platform, {
    rps: Number(process.env.GROCERY_RPS) || 2,
  });

  await mkdir(RAW_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, `${platform}-taxonomy.jsonl`);
  await writeFile(rawPath, ""); // truncate previous run

  const supabase = dryRun ? null : adminClient();

  const seenKeys = new Set<string>();
  const batch: ScrapedCategory[] = [];

  let count = 0;
  for await (const cat of adapter.listTaxonomy(session)) {
    count++;
    const key = `${cat.super_category_name}|${cat.name}|${cat.parent_category_name ?? ""}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    await appendFile(rawPath, JSON.stringify(cat) + "\n");
    batch.push(cat);

    if (count % 25 === 0) {
      console.log(`[01-scrape-categories] discovered ${count} categories…`);
    }
    if (limit && count >= limit) break;
  }

  console.log(`[01-scrape-categories] total discovered: ${count}`);

  if (dryRun) {
    console.log(`[01-scrape-categories] --dry-run; raw saved to ${rawPath}`);
    return;
  }

  if (!supabase) return;

  // PostgREST's upsert(onConflict) requires the cache to know about the
  // unique constraint, and Supabase's null-distinct behaviour has caused
  // PGRST125 issues for us. Instead, we dedupe in code: read what's
  // already there, then insert only the new rows. Slightly chattier on
  // re-runs but bulletproof against schema-cache races.
  const rows = batch.map((c) => ({
    super_category: c.super_category_name,
    category: c.name,
    subcategory: c.parent_category_name ? c.name : null,
    last_seen_at: new Date().toISOString(),
  }));

  type ExistingRow = {
    super_category: string | null;
    category: string | null;
    subcategory: string | null;
  };
  const { data: existing, error: readErr } = await supabase
    .from("zepto_taxonomy")
    .select("super_category, category, subcategory");
  if (readErr) {
    console.error("[01-scrape-categories] failed to read existing rows:", readErr);
    process.exit(1);
  }
  const seen = new Set<string>(
    ((existing ?? []) as ExistingRow[]).map(
      (r) => `${r.super_category ?? ""}|${r.category ?? ""}|${r.subcategory ?? ""}`,
    ),
  );
  const toInsert = rows.filter(
    (r) => !seen.has(`${r.super_category ?? ""}|${r.category ?? ""}|${r.subcategory ?? ""}`),
  );

  if (toInsert.length === 0) {
    console.log(`[01-scrape-categories] no new categories to insert (all ${rows.length} already present).`);
    return;
  }

  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { error } = await supabase.from("zepto_taxonomy").insert(chunk);
    if (error) {
      console.error(`[01-scrape-categories] insert error @ chunk ${i}:`, error);
      process.exit(1);
    }
  }

  console.log(
    `[01-scrape-categories] inserted ${toInsert.length} new rows to zepto_taxonomy ` +
      `(${rows.length - toInsert.length} already present).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
