#!/usr/bin/env -S pnpm tsx
/**
 * Fill missing nutrition / ingredients from IFCT/USDA reference data.
 *
 *   pnpm reference:fill                              # write all matches
 *   pnpm reference:fill -- --dry-run --limit=50    # estimate match count
 *   pnpm reference:fill -- --min-confidence=0.58   # stricter matching
 */
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  hasIngredients,
  isPlatformNutritionComplete,
  nutritionIsSparse,
} from "@/lib/nutrition/completeness";
import { mergeNutrition } from "@/lib/grocery/parse-nutrition-block";
import {
  matchReferenceFood,
  referenceIngredients,
  referenceToNutrition,
} from "@/lib/nutrition/reference-seed";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

interface Args {
  limit: number | null;
  dryRun: boolean;
  minConfidence: number;
  platform: string | null;
}

interface Row {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let minConfidence = 0.55;
  let platform: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    if (a.startsWith("--min-confidence=")) minConfidence = Number(a.split("=")[1]);
    if (a.startsWith("--platform=")) platform = a.split("=")[1];
  }
  return {
    limit,
    dryRun: argv.includes("--dry-run"),
    minConfidence,
    platform,
  };
}

function needsFill(row: Row): boolean {
  if (isPlatformNutritionComplete(row.ingredients_raw, row.nutrition)) return false;
  return nutritionIsSparse(row.nutrition) || !hasIngredients(row.ingredients_raw);
}

async function fetchCandidates(args: Args): Promise<Row[]> {
  const supabase = adminClient();
  const pageSize = 500;
  const out: Row[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select("id, name, category, subcategory, ingredients_raw, nutrition")
      .order("scraped_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (args.platform) q = q.eq("platform", args.platform);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as Row[]) {
      if (needsFill(row)) out.push(row);
      if (args.limit != null && out.length >= args.limit) return out;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[fill-reference] min_confidence=${args.minConfidence} dry_run=${args.dryRun} platform=${args.platform ?? "all"}`,
  );

  const rows = await fetchCandidates(args);
  console.log(`[fill-reference] candidates=${rows.length}`);

  let matched = 0;
  let updated = 0;
  let skippedMatch = 0;
  let skippedNoGap = 0;
  const byType: Record<string, number> = {};
  const samples: string[] = [];

  const supabase = adminClient();
  const batch: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const row of rows) {
    const m = matchReferenceFood(row.name, {
      category: row.category,
      subcategory: row.subcategory,
      minConfidence: args.minConfidence,
    });
    if (!m) {
      skippedMatch++;
      continue;
    }
    matched++;
    byType[m.match_type] = (byType[m.match_type] ?? 0) + 1;

    const refNutrition = referenceToNutrition(m.entry, m);
    const patch: Record<string, unknown> = {};

    if (nutritionIsSparse(row.nutrition)) {
      const merged = mergeNutrition(refNutrition, row.nutrition);
      if (merged) patch.nutrition = merged;
    }

    if (!hasIngredients(row.ingredients_raw)) {
      patch.ingredients_raw = referenceIngredients(m.entry);
    }

    if (Object.keys(patch).length === 0) {
      skippedNoGap++;
      continue;
    }

    patch.updated_at = new Date().toISOString();

    if (args.dryRun) {
      if (samples.length < 20) {
        samples.push(
          `${row.name} -> ${m.entry.id} (${m.match_type}, conf=${m.confidence.toFixed(2)})`,
        );
      }
      updated++;
      continue;
    }

    batch.push({ id: row.id, patch });
    if (batch.length >= 50) {
      await flushBatch(supabase, batch);
      updated += batch.length;
      batch.length = 0;
    }
  }

  if (!args.dryRun && batch.length) {
    await flushBatch(supabase, batch);
    updated += batch.length;
  }

  console.log(
    `[fill-reference] matched=${matched} would_update=${updated} no_match=${skippedMatch} no_gap=${skippedNoGap}`,
  );
  console.log(`[fill-reference] match_types=${JSON.stringify(byType)}`);
  if (samples.length) {
    console.log("\nSample matches:");
    for (const s of samples) console.log(`  ${s}`);
  }
}

async function flushBatch(
  supabase: ReturnType<typeof adminClient>,
  batch: Array<{ id: string; patch: Record<string, unknown> }>,
): Promise<void> {
  for (const { id, patch } of batch) {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) console.warn(`[fill-reference] update ${id}: ${error.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
