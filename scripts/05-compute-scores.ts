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
import {
  persistCoreScore,
  SCORING_RULE_VERSION,
  type ScoreableProduct,
} from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

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
    onlyUnscored: argv.includes("--only-unscored"),
  };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();

  let query = supabase
    .from("products")
    .select(
      "id, name, category, subcategory, ingredients_raw, nutrition, attributes, core_scores ( rule_version )",
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
    const rel = row.core_scores as
      | { rule_version: number }
      | { rule_version: number }[]
      | null;
    const existing = Array.isArray(rel) ? rel[0] : rel;
    if (
      args.onlyUnscored &&
      existing?.rule_version === SCORING_RULE_VERSION &&
      !args.force
    ) {
      skipped++;
      continue;
    }

    const scoreRow: ScoreableProduct = {
      id: row.id,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      ingredients_raw: row.ingredients_raw,
      nutrition: row.nutrition as ProductNutrition | null,
      attributes: (row.attributes ?? null) as Record<string, string> | null,
    };

    const outcome = await persistCoreScore(supabase, scoreRow, {
      force: args.force,
      dryRun: args.dryRun,
    });
    if (outcome === "scored") scored++;
    else if (outcome === "skipped") skipped++;
  }

  console.log(
    `[05-compute-scores] done. scored=${scored} skipped=${skipped} (rule_version=${SCORING_RULE_VERSION})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
