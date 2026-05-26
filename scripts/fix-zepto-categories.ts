#!/usr/bin/env -S pnpm tsx
/**
 * Re-apply canonical aisle mapping from stored Zepto super + subcategory shelves.
 * Run after updating data/category-canonical-map.json.
 *
 *   pnpm tsx scripts/fix-zepto-categories.ts
 *   pnpm tsx scripts/fix-zepto-categories.ts --dry-run
 */
import { config as loadEnv } from "dotenv";
import { mapToCanonicalTaxonomy } from "@/lib/catalog/policy";
import { adminClient } from "@/lib/supabase/admin";

loadEnv({ path: ".env.local" });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = adminClient();
  const pageSize = 500;
  let offset = 0;
  let changed = 0;
  const samples: string[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, super_category, category, subcategory")
      .eq("platform", "zepto")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const canon = mapToCanonicalTaxonomy({
        platform: "zepto",
        super_category: row.super_category as string | null,
        category: row.super_category as string | null,
        subcategory: row.subcategory as string | null,
      });
      const nextCategory = canon.category ?? (row.category as string | null);
      if (nextCategory === row.category) continue;

      changed++;
      if (samples.length < 25) {
        samples.push(
          `${row.category} → ${nextCategory} | ${row.subcategory} | ${(row.name as string).slice(0, 50)}`,
        );
      }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("products")
          .update({ category: nextCategory, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (upErr) console.warn(upErr.message);
      }
    }

    offset += pageSize;
    if (data.length < pageSize) break;
  }

  console.log(`[fix-zepto-categories] ${dryRun ? "would change" : "changed"}=${changed}`);
  if (samples.length) {
    console.log("\nSamples:");
    for (const s of samples) console.log(`  ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
