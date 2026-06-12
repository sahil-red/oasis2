#!/usr/bin/env -S pnpm tsx
/**
 * Fix LLM "Insulin XXX" misreads for INS/E food additives, correct 4700BC nutrition,
 * and rescore affected products.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import { persistCoreScoresBatch } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

const PRODUCT_SLUG =
  "zepto-4700bc-4700bc-protein-pops-makhana-hawaiian-barbeque-po-6288ca95";

/** Flavor enhancers — watchful, not hazardous. */
const WATCHFUL_INS = new Set(["627", "631", "621", "622"]);

function insTier(code: string): "innocuous" | "watchful" {
  return WATCHFUL_INS.has(code) ? "watchful" : "innocuous";
}

function insRole(code: string): string {
  if (code === "451") return "acid_regulator";
  if (code === "330") return "acid_regulator";
  if (WATCHFUL_INS.has(code)) return "flavor_enhancer";
  if (code === "551") return "anticaking";
  if (code === "1422") return "starch";
  return "additive";
}

function nutritionFromLabel(): ProductNutrition {
  const servingG = 28;
  const per100 = {
    energy_kcal_100g: 469.3,
    protein_g_100g: 9.9,
    carbs_g_100g: 58.2,
    sugar_g_100g: 5.6,
    added_sugar_g_100g: 0,
    fiber_g_100g: 11.9,
    fat_g_100g: 21.4,
    saturated_fat_g_100g: 5,
    trans_fat_g_100g: 0,
    sodium_mg_100g: 381,
  };
  const scale = servingG / 100;
  return {
    source: "label",
    ...per100,
    extra: {
      label_basis: "per_100g",
      serving_size_g: servingG,
      servings_per_pack: 1,
      nutrition_source: "label_photo_corrected",
      corrected_at: new Date().toISOString(),
      per_serve_energy_kcal: per100.energy_kcal_100g * scale,
      per_serve_protein_g: per100.protein_g_100g * scale,
      per_serve_carbs_g: per100.carbs_g_100g * scale,
      per_serve_sugar_g: per100.sugar_g_100g * scale,
      per_serve_fiber_g: per100.fiber_g_100g * scale,
      per_serve_fat_g: per100.fat_g_100g * scale,
      per_serve_sodium_mg: per100.sodium_mg_100g * scale,
    },
  };
}

async function patchInsulinMislabels(s: ReturnType<typeof adminClient>) {
  const { data, error } = await s
    .from("ingredient_intelligence")
    .select("normalized_name, display_name, concern_tier")
    .ilike("display_name", "Insulin%");
  if (error) throw error;

  let patched = 0;
  for (const row of data ?? []) {
    const m = String(row.normalized_name).match(/ins\s*(\d{3,4}[a-z]?)/i);
    if (!m) continue;
    const code = m[1]!.toLowerCase();
    const tier = insTier(code.replace(/[a-z]$/, ""));
    const patch = {
      normalized_name: row.normalized_name,
      display_name: `INS ${code.toUpperCase()}`,
      concern_tier: tier,
      role: insRole(code.replace(/[a-z]$/, "")),
      concern_reasons: ["Permitted food additive (INS/E number)"],
      intrinsic_quality: tier === "innocuous" ? 65 : 55,
      nova_class: 4,
      model: "manual_correction",
      rated_at: new Date().toISOString(),
    };
    const { error: upErr } = await s
      .from("ingredient_intelligence")
      .upsert(patch, { onConflict: "normalized_name" });
    if (upErr) {
      console.error(`FAIL ${row.normalized_name}: ${upErr.message}`);
    } else {
      console.log(`OK   ${row.normalized_name} → ${patch.display_name} (${tier})`);
      patched++;
    }
  }
  return patched;
}

async function fix4700bcNutrition(s: ReturnType<typeof adminClient>) {
  const { data: product, error } = await s
    .from("products")
    .select("id, slug, name, category, subcategory, net_weight, nutrition, attributes, ocr_payload")
    .eq("slug", PRODUCT_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!product) throw new Error(`Product not found: ${PRODUCT_SLUG}`);

  const nutrition = nutritionFromLabel();
  const display = reconcileNutrition({
    nutrition,
    attributes: product.attributes,
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    net_weight: product.net_weight,
  });

  const ocrPayload = {
    ...(typeof product.ocr_payload === "object" && product.ocr_payload
      ? (product.ocr_payload as Record<string, unknown>)
      : {}),
    label_resolution: {
      nutrition_source: "label_photo_corrected",
      manual_correction_at: new Date().toISOString(),
      prior_stored_nutrition: product.nutrition,
    },
  };

  const { error: upErr } = await s
    .from("products")
    .update({
      nutrition: display,
      ocr_payload: ocrPayload,
    })
    .eq("id", product.id);
  if (upErr) throw upErr;

  console.log(`\nNutrition updated for ${product.name}`);
  console.log(`  sugar: ${display.sugar_g_100g}g/100g (was ${(product.nutrition as ProductNutrition | null)?.sugar_g_100g})`);
  return product.id;
}

async function rescoreAffectedProducts(s: ReturnType<typeof adminClient>) {
  const slugFilter = PRODUCT_SLUG;
  const { data, error } = await s
    .from("products")
    .select("id, name, category, subcategory, ingredients_raw, nutrition, attributes")
    .not("ingredients_raw", "is", null)
    .or(
      `slug.eq.${slugFilter},ingredients_raw.ilike.%ins 451%,ingredients_raw.ilike.%ins 330%,ingredients_raw.ilike.%ins 627%,ingredients_raw.ilike.%ins 631%,ingredients_raw.ilike.%ins 551%,ingredients_raw.ilike.%ins 1422%,ingredients_raw.ilike.%ins451%,ingredients_raw.ilike.%ins330%`,
    );
  if (error) throw error;

  const products = data ?? [];
  console.log(`\nRescoring ${products.length} products with common INS additives…`);

  const batchSize = 25;
  let total = { scored: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const outcome = await persistCoreScoresBatch(s, batch, {});
    total = {
      scored: total.scored + (outcome.scored ?? 0),
      skipped: total.skipped + (outcome.skipped ?? 0),
      failed: total.failed + (outcome.failed ?? 0),
    };
    console.log(`  batch ${Math.floor(i / batchSize) + 1}: scored=${outcome.scored} skipped=${outcome.skipped}`);
  }
  return total;
}

async function main() {
  const s = adminClient();
  console.log("=== Patching insulin mislabels in ingredient_intelligence ===");
  const patched = await patchInsulinMislabels(s);
  console.log(`Patched ${patched} rows\n`);

  console.log("=== Fixing 4700BC Hawaiian Barbeque nutrition from label photo ===");
  await fix4700bcNutrition(s);

  const totals = await rescoreAffectedProducts(s);
  console.log("\nDone.", totals);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
