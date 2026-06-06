#!/usr/bin/env -S pnpm tsx
/**
 * §15 — propose eval cases from search_history (deduped queries with result_count > 0).
 *
 *   pnpm search:seed-eval
 *
 * Prints JSON snippets to merge into eval/search-cases.json — does not auto-write.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

async function main() {
  const existing = JSON.parse(
    readFileSync(join(process.cwd(), "eval/search-cases.json"), "utf8"),
  ) as Array<{ id: string; query: string }>;
  const existingQueries = new Set(existing.map((c) => c.query.toLowerCase()));

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("search_history")
    .select("query, intent_tier, result_count")
    .gt("result_count", 0)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const proposals: Array<{ id: string; query: string; must_include_patterns: string[]; must_exclude_patterns: string[] }> = [];

  for (const row of data ?? []) {
    const q = String(row.query).trim();
    const key = q.toLowerCase();
    if (!q || seen.has(key) || existingQueries.has(key)) continue;
    seen.add(key);
    const id = `history-${key.replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    proposals.push({
      id,
      query: q,
      must_include_patterns: [],
      must_exclude_patterns: [],
    });
    if (proposals.length >= 30) break;
  }

  console.log(`[search:seed-eval] ${proposals.length} proposals (merge manually into eval/search-cases.json):`);
  console.log(JSON.stringify(proposals, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
