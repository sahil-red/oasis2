#!/usr/bin/env -S pnpm tsx
/**
 * Ingredient-consistency gate (Part A). Verifies the canonical resolver collapses a
 * family's many label phrasings to ONE authoritative rating — the fix for "soy" and
 * "soy flour" getting independent (divergent) LLM scores. This is what Part A
 * controls: the per-ingredient rating and the ABSOLUTE score.
 *
 * It also REPORTS the soya-chunk score spread for context. Note: the FINAL score also
 * folds in a category-relative percentile (v9 blend 0.55·abs + 0.45·rel) — that
 * relative term, not ingredients, is what still spreads same-nutrition products, and
 * it's a separate lever (Part B: category-relative rank). We don't gate on it here.
 *
 *   pnpm score:consistency
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { resolveKnownCanonical } from "@/lib/scoring/ingredient-known";

const FAMILIES: Record<string, string[]> = {
  soy: ["soy", "soya", "soybean", "soy bean", "soya beans", "soy flour", "soya flour", "defatted soy", "defatted soya flour", "soya chunks", "soy chunks", "soya nuggets", "textured soy protein", "textured vegetable protein", "soya granules", "soy protein isolate", "hydrolysed soya protein", "edible soya"],
};

async function main() {
  let failed = 0;

  // 1. Canonical consistency — every phrasing in a family resolves to one rating.
  console.log("=== canonical resolution (one rating per family) ===");
  for (const [fam, variants] of Object.entries(FAMILIES)) {
    const resolved = variants.map((v) => resolveKnownCanonical(v));
    const canon = new Set(resolved.map((r) => r?.normalized_name ?? "NULL"));
    const iqs = new Set(resolved.map((r) => r?.intrinsic_quality ?? -1));
    const ok = canon.size === 1 && !canon.has("NULL") && iqs.size === 1;
    console.log(`  ${fam}: ${variants.length} phrasings → canonical={${[...canon].join(",")}} iq={${[...iqs].join(",")}} ${ok ? "OK" : "INCONSISTENT"}`);
    if (!ok) failed++;
  }

  // 2. Report soya-chunk cohort spread (absolute = Part A; final = +relative = Part B).
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1 });
  try {
    const rows = (await sql`
      SELECT cs.absolute_score abs, psi.scout_score fin
      FROM product_search_index psi LEFT JOIN core_scores cs ON cs.product_id = psi.product_id
      WHERE (psi.name ILIKE '%soya chunk%' OR psi.name ILIKE '%meal maker%' OR psi.name ILIKE '%soya nugget%')
        AND psi.scout_score IS NOT NULL AND cs.absolute_score IS NOT NULL
        AND psi.protein_g BETWEEN 50 AND 56 AND COALESCE(psi.fat_g,99) <= 3`) as unknown as { abs: number; fin: number }[];
    if (rows.length) {
      const abs = rows.map((r) => r.abs), fin = rows.map((r) => r.fin);
      console.log(`\n=== soya-chunk cohort (n=${rows.length}) ===`);
      console.log(`  ABSOLUTE spread = ${Math.max(...abs) - Math.min(...abs)} (nutrition + ingredients — Part A)`);
      console.log(`  FINAL    spread = ${Math.max(...fin) - Math.min(...fin)} (+ relative percentile — Part B lever)`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (failed) { console.error(`\n[score:consistency] FAIL — ${failed} family resolves inconsistently`); process.exit(1); }
  console.log("\n[score:consistency] PASS — ingredient families resolve to one canonical rating");
}
main().catch((e) => { console.error(e); process.exit(1); });
