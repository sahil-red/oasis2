#!/usr/bin/env -S pnpm tsx
/**
 * Compute Core scores for products in the DB and upsert into core_scores.
 *
 *   pnpm score                           # all products with nutrition
 *   pnpm score -- --with-detail          # only PDP-scraped cohort (~50 SKUs)
 *   pnpm score -- --limit=50
 *   pnpm score -- --dry-run
 *   pnpm score -- --force                # re-score all (batched upserts)
 *   pnpm score -- --only-unscored        # skip rows already on current rule_version
 */

import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  persistCoreScoresBatch,
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
  const started = Date.now();

  let query: any = supabase
    .from("products")
    .select(
      "id, name, category, subcategory, ingredients_raw, nutrition, attributes, core_scores ( rule_version )",
    )
    .not("nutrition", "is", null);

  if (args.withDetail) {
    query = query.not("raw_payload", "is", null);
    console.log("[05-compute-scores] --with-detail: PDP-scraped products only.");
  }

  const pageSize = args.limit ?? 1000;
  let scored = 0;
  let skipped = 0;
  let noNutrition = 0;
  let offset = 0;
  let totalFetched = 0;

  while (true) {
    const { data: rows, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      console.error("[05-compute-scores] fetch failed:", error);
      process.exit(1);
    }
    if (!rows?.length) {
      if (offset === 0) {
        console.log("[05-compute-scores] no products with nutrition to score.");
      }
      break;
    }
    totalFetched += rows.length;

    const toScore: ScoreableProduct[] = [];
    for (const row of rows) {
      const rel = row.core_scores as
        | { rule_version: number }
        | { rule_version: number }[]
        | null;
      const existing = Array.isArray(rel) ? rel[0] : rel;
      if (
        args.onlyUnscored &&
        !args.force &&
        existing?.rule_version === SCORING_RULE_VERSION
      ) {
        skipped++;
        continue;
      }

      toScore.push({
        id: row.id,
        name: row.name,
        category: row.category,
        subcategory: row.subcategory,
        ingredients_raw: row.ingredients_raw,
        nutrition: row.nutrition as ProductNutrition | null,
        attributes: (row.attributes ?? null) as Record<string, string> | null,
      });
    }

    if (toScore.length) {
      const outcome = await persistCoreScoresBatch(supabase, toScore, {
        dryRun: args.dryRun,
      });
      scored += outcome.scored;
      noNutrition += outcome.no_nutrition;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[05-compute-scores] progress fetched=${totalFetched} scored=${scored} skipped=${skipped} no_nutrition=${noNutrition} (${elapsed}s)`,
    );

    if (args.limit || rows.length < pageSize) break;
    offset += pageSize;
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[05-compute-scores] done. fetched=${totalFetched} scored=${scored} skipped=${skipped} no_nutrition=${noNutrition} rule_version=${SCORING_RULE_VERSION} (${elapsed}s)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
