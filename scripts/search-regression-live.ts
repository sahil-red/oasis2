/**
 * Live catalog search regression (requires Supabase via .env.local).
 * Run: pnpm search:regression:live
 */
import { config as loadEnv } from "dotenv";
import { classifyIntent } from "@/lib/search/intent-classify";
import { runAiProductSearch } from "@/lib/search/ai-search";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import { LIVE_SEARCH_CASES } from "@/lib/search/search-regression-cases";

loadEnv({ path: ".env.local" });

let failed = 0;

for (const c of LIVE_SEARCH_CASES) {
  const tier = c.tier ?? classifyIntent(c.query);
  if (c.expectTier && tier !== c.expectTier) {
    console.error(`[live] FAIL tier "${c.query}" → ${tier} (expected ${c.expectTier})`);
    failed++;
    continue;
  }

  if (tier === "lexical") continue;

  const parsed = heuristicParseProductQuery(c.query);
  let result;
  try {
    result = await runAiProductSearch(
      { parsed, source: "heuristic" },
      { prompt: c.query, tier, limit: c.limit ?? 12 },
    );
  } catch (e) {
    console.error(`[live] ERROR "${c.query}":`, (e as Error).message);
    failed++;
    continue;
  }

  const names = result.items.map((i) => i.name ?? "").slice(0, c.checkTop ?? 5);
  if (c.minResults != null && c.minResults > 0 && result.items.length < c.minResults) {
    console.error(
      `[live] FAIL "${c.query}" only ${result.items.length} results (need ${c.minResults})`,
    );
    failed++;
    continue;
  }

  if (c.topMustNotMatch && names.some((n) => c.topMustNotMatch!.test(n))) {
    console.error(`[live] FAIL "${c.query}" bad top match:`, names[0]);
    failed++;
    continue;
  }

  if (c.topMustMatch && !names.some((n) => c.topMustMatch!.test(n))) {
    console.error(`[live] FAIL "${c.query}" no good top match in:`, names.slice(0, 3).join(" | "));
    failed++;
    continue;
  }

  console.log(
    `[live] OK "${c.query}" tier=${tier} rank=${result.rank_source} n=${result.items.length} top=${names[0]?.slice(0, 50) ?? "—"}`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} live regression check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${LIVE_SEARCH_CASES.filter((c) => c.expectTier !== "lexical").length} live checks passed.`);
