#!/usr/bin/env tsx
/**
 * Sync stale nutrition data from products.nutrition → product_search_index.
 * The search index was built with incorrect values (per-pack mislabeled as per-100g,
 * LLM hallucinated scaling). This script reads corrected values from the products table
 * and updates the search index to match.
 *
 * Run: npx tsx scripts/sync-search-index-nutrition.ts
 */
import { adminClient } from "../lib/supabase/admin";
import { assignTiersForType } from "../lib/search/v2/nutrition-tiers";

const supabase = adminClient();

type IndexRow = {
  product_id: string;
  name: string;
  protein_g: number | null;
  sugar_g: number | null;
  fat_g: number | null;
  energy_kcal: number | null;
  carbs_g: number | null;
  primary_type: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  nutrition: Record<string, unknown> | null;
};

function extractPer100g(nutrition: Record<string, unknown>, field: string): number | null {
  const v = nutrition[field];
  if (typeof v !== "number") return null;
  return v;
}

async function main() {
  console.log("=== Syncing search index nutrition from products table ===\n");

  // 1. Fetch all index rows with their nutrition
  const { data: indexRows, error: idxErr } = await supabase
    .from("product_search_index")
    .select("product_id, name, protein_g, sugar_g, fat_g, energy_kcal, carbs_g, primary_type");

  if (idxErr || !indexRows?.length) {
    console.error("Failed to fetch index:", idxErr?.message);
    return;
  }
  console.log(`Found ${indexRows.length} index rows`);

  // 2. Fetch corresponding products (batch to avoid IN clause limits)
  const nutritionMap = new Map<string, Record<string, unknown>>();
  const BATCH = 200;
  for (let i = 0; i < indexRows.length; i += BATCH) {
    const ids = indexRows.slice(i, i + BATCH).map((r) => r.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("id, nutrition")
      .in("id", ids);
    for (const p of products ?? []) {
      if (p.nutrition) nutritionMap.set(p.id, p.nutrition as Record<string, unknown>);
    }
  }
  console.log(`Found ${nutritionMap.size} products with nutrition data\n`);

  // 4. Compare and update
  let updated = 0;
  let unchanged = 0;
  const updates: Array<{ product_id: string; protein_g: number | null; sugar_g: number | null; fat_g: number | null; energy_kcal: number | null; carbs_g: number | null }> = [];

  for (const idx of indexRows as IndexRow[]) {
    const nut = nutritionMap.get(idx.product_id);
    if (!nut) continue;

    const newProtein = extractPer100g(nut, "protein_g_100g");
    const newSugar = extractPer100g(nut, "sugar_g_100g");
    const newFat = extractPer100g(nut, "fat_g_100g");
    const newKcal = extractPer100g(nut, "energy_kcal_100g");
    const newCarbs = extractPer100g(nut, "carbs_g_100g");

    // Check if values differ (handle null vs number)
    const changed =
      idx.protein_g !== newProtein ||
      idx.sugar_g !== newSugar ||
      idx.fat_g !== newFat ||
      idx.energy_kcal !== newKcal ||
      idx.carbs_g !== newCarbs;

    if (!changed) {
      unchanged++;
      continue;
    }

    updates.push({
      product_id: idx.product_id,
      protein_g: newProtein,
      sugar_g: newSugar,
      fat_g: newFat,
      energy_kcal: newKcal,
      carbs_g: newCarbs,
    });

    if (updates.length <= 20) {
      console.log(`  ${idx.name}`);
      if (idx.protein_g !== newProtein) console.log(`    protein: ${idx.protein_g}g → ${newProtein}g`);
      if (idx.sugar_g !== newSugar) console.log(`    sugar: ${idx.sugar_g}g → ${newSugar}g`);
      if (idx.fat_g !== newFat) console.log(`    fat: ${idx.fat_g}g → ${newFat}g`);
      if (idx.energy_kcal !== newKcal) console.log(`    kcal: ${idx.energy_kcal} → ${newKcal}`);
      if (idx.carbs_g !== newCarbs) console.log(`    carbs: ${idx.carbs_g}g → ${newCarbs}g`);
    }
  }

  if (updates.length > 20) {
    console.log(`  ... and ${updates.length - 20} more`);
  }

  console.log(`\n${updates.length} rows to update, ${unchanged} unchanged`);

  // 5. Batch update
  const UPDATE_BATCH = 50;
  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);
    for (const u of batch) {
      const { error } = await supabase
        .from("product_search_index")
        .update({
          protein_g: u.protein_g,
          sugar_g: u.sugar_g,
          fat_g: u.fat_g,
          energy_kcal: u.energy_kcal,
          carbs_g: u.carbs_g,
        })
        .eq("product_id", u.product_id);
      if (error) {
        console.error(`  FAILED to update ${u.product_id}: ${error.message}`);
      } else {
        updated++;
      }
    }
    console.log(`  Updated ${Math.min(i + UPDATE_BATCH, updates.length)}/${updates.length}`);
  }

  // 6. Rebuild tiers per primary_type
  console.log("\n=== Rebuilding protein_tier/sugar_tier/fat_tier ===\n");

  const { data: allIndex, error: fetchErr } = await supabase
    .from("product_search_index")
    .select("product_id, primary_type, protein_g, sugar_g, fat_g");

  if (fetchErr || !allIndex?.length) {
    console.error("Failed to fetch index for tier rebuild:", fetchErr?.message);
    return;
  }

  // Group by primary_type
  const byType = new Map<string, typeof allIndex>();
  for (const row of allIndex) {
    const key = row.primary_type ?? "unknown";
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }

  let tiersUpdated = 0;
  for (const [type, group] of byType) {
    if (group.length < 3) continue; // Skip tiny cohorts

    const tiers = assignTiersForType(
      group.map((r) => ({
        sugar_g: r.sugar_g,
        protein_g: r.protein_g,
        fat_g: r.fat_g,
      })),
    );

    for (let i = 0; i < group.length; i++) {
      const row = group[i]!;
      const tier = tiers[i]!;
      const { error } = await supabase
        .from("product_search_index")
        .update({
          protein_tier: tier.protein_tier,
          sugar_tier: tier.sugar_tier,
          fat_tier: tier.fat_tier,
        })
        .eq("product_id", row.product_id);
      if (!error) tiersUpdated++;
    }
    console.log(`  ${type}: ${group.length} products, tiers rebuilt`);
  }

  console.log(`\n=== Done. ${updated} nutrition fields updated, ${tiersUpdated} tiers rebuilt ===`);
}

main().catch(console.error);
