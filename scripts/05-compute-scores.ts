#!/usr/bin/env -S pnpm tsx
/**
 * Compute Core scores for products in the DB and upsert into core_scores.
 *
 *   pnpm score                           # all products with nutrition
 *   pnpm score -- --with-detail          # only PDP-scraped cohort (~50 SKUs)
 *   pnpm score -- --limit=50
 *   pnpm score -- --dry-run
 */

import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { computeCoreScore } from "@/lib/scoring/core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

const RULE_VERSION = Number(process.env.SCORING_RULE_VERSION ?? 1);

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return {
    limit,
    dryRun: argv.includes("--dry-run"),
    withDetail: argv.includes("--with-detail"),
    force: argv.includes("--force"),
  };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();

  let query = supabase
    .from("products")
    .select(
      "id, name, category, subcategory, ingredients_raw, nutrition, attributes",
    )
    .not("nutrition", "is", null);

  if (args.withDetail) {
    query = query.not("raw_payload", "is", null);
    console.log("[05-compute-scores] --with-detail: PDP-scraped products only.");
  }

  if (args.limit) query = query.limit(args.limit);
  else query = query.limit(5_000);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[05-compute-scores] fetch failed:", error);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("[05-compute-scores] no products with nutrition to score.");
    return;
  }

  let scored = 0;
  let skipped = 0;

  for (const row of rows) {
    const nutrition = row.nutrition as ProductNutrition | null;
    const attributes = (row.attributes ?? null) as Record<string, string> | null;

    const result = computeCoreScore({
      ingredients_raw: row.ingredients_raw,
      nutrition,
      category: row.category,
      subcategory: row.subcategory,
      attributes,
    });

    if (args.dryRun) {
      console.log(
        `${row.name?.slice(0, 40).padEnd(40)}  ${result.score} ${result.grade}  ` +
          `N${result.subscores.nutrition} A${result.subscores.additives} L${result.subscores.labels}`,
      );
      scored++;
      continue;
    }

    if (!args.force) {
      const { data: existing } = await supabase
        .from("core_scores")
        .select("product_id, rule_version")
        .eq("product_id", row.id)
        .maybeSingle();
      if (existing && existing.rule_version === RULE_VERSION) {
        skipped++;
        continue;
      }
    }

    const { error: upErr } = await supabase.from("core_scores").upsert({
      product_id: row.id,
      score: result.score,
      grade: result.grade,
      band: result.band,
      subscores: result.subscores,
      concerns: result.concerns,
      breakdown: result.breakdown,
      rule_version: RULE_VERSION,
      computed_at: new Date().toISOString(),
    });
    if (upErr) {
      console.warn(`[05-compute-scores] upsert ${row.id}:`, upErr.message);
      continue;
    }
    scored++;
  }

  console.log(
    `[05-compute-scores] done. scored=${scored} skipped=${skipped} (rule_version=${RULE_VERSION})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
