#!/usr/bin/env -S pnpm tsx
/**
 * Fresh fruits & vegetables don't have packaging labels, so OCR can never fill
 * their nutrition. This script matches each Fruits & Vegetables product against
 * `data/fresh-produce.json` (curated USDA / IFCT per-100g values) and writes
 * the matched nutrition into the products table. Run before `pnpm score` so
 * the score backfill picks them up.
 *
 *   pnpm tsx scripts/seed-fresh-produce.ts            # write nutrition for all matches
 *   pnpm tsx scripts/seed-fresh-produce.ts --dry-run  # report matches, write nothing
 */
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { matchProduce, produceLabelHint, produceToNutrition } from "@/lib/produce/seed";

loadEnv({ path: ".env.local" });

type Row = {
  id: string;
  name: string;
  category: string | null;
  ingredients_raw: string | null;
  nutrition: Record<string, unknown> | null;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const supabase = adminClient();

  const { data, error } = (await supabase
    .from("products")
    .select("id, name, category, ingredients_raw, nutrition")
    .or("category.ilike.%fruit%,category.ilike.%vegetable%")
    .limit(5000)) as unknown as { data: Row[]; error: { message: string } | null };
  if (error) {
    console.error("[seed-fresh-produce] fetch failed:", error.message);
    process.exit(1);
  }

  let matched = 0;
  let updated = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  for (const row of data ?? []) {
    const entry = matchProduce(row.name);
    if (!entry) {
      unmatched.push(row.name);
      continue;
    }
    matched++;

    if (row.nutrition && Object.keys(row.nutrition).length > 0 && !force) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[match] ${row.name}  ->  ${entry.id}`);
      continue;
    }

    const nutrition = produceToNutrition(entry);
    const ingredients_raw = row.ingredients_raw && row.ingredients_raw.length > 0
      ? row.ingredients_raw
      : `${produceLabelHint(entry)}: ${entry.id.replace(/-/g, " ")}.`;

    const { error: upErr } = await supabase
      .from("products")
      .update({ nutrition, ingredients_raw })
      .eq("id", row.id);

    if (upErr) {
      console.warn(`[upsert] ${row.name}: ${upErr.message}`);
      continue;
    }
    updated++;
  }

  console.log(
    `[seed-fresh-produce] total=${data?.length ?? 0} matched=${matched} updated=${updated} skipped=${skipped} unmatched=${unmatched.length}`,
  );
  if (unmatched.length) {
    console.log("\nUnmatched samples:");
    for (const n of unmatched.slice(0, 30)) console.log("  -", n);
    if (unmatched.length > 30) console.log(`  ... and ${unmatched.length - 30} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
