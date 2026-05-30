#!/usr/bin/env -S pnpm tsx
/**
 * Patch a product's nutrition from verified label values.
 *
 *   pnpm tsx scripts/fix-product-nutrition.ts --slug=zepto-... --dry-run
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import type { ProductNutrition } from "@/lib/supabase/types";

function parseArgs() {
  const slug = process.argv.find((a) => a.startsWith("--slug="))?.slice(7);
  const dryRun = process.argv.includes("--dry-run");
  if (!slug) throw new Error("Usage: --slug=<product-slug>");
  return { slug, dryRun };
}

/** Verified Akshayakalpa Organic Malai Paneer label (per 100g, FSSAI table). */
function verifiedNutrition(): ProductNutrition {
  return {
    source: "label",
    energy_kcal_100g: 298,
    protein_g_100g: 20,
    carbs_g_100g: 0.5,
    sugar_g_100g: 0.5,
    added_sugar_g_100g: 0,
    fat_g_100g: 24,
    saturated_fat_g_100g: 17.61,
    trans_fat_g_100g: 0.39,
    sodium_mg_100g: 17.4,
    extra: {
      label_basis: "per_100g",
      serving_size: "100g per serving",
      serving_size_g: 100,
      servings_per_pack: 2,
      cholesterol_mg_100g: 105.3,
      nutrition_source: "verified_label_photo",
      corrected_at: new Date().toISOString(),
    },
  };
}

async function main() {
  const { slug, dryRun } = parseArgs();
  const supabase = adminClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, slug, name, category, subcategory, net_weight, nutrition, attributes, ocr_payload")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error(`Product not found: ${slug}`);

  const nutrition = verifiedNutrition();
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
      ...((product.ocr_payload as Record<string, unknown> | null)?.label_resolution as
        | Record<string, unknown>
        | undefined),
      nutrition_source: "verified_label_photo",
      manual_correction_at: new Date().toISOString(),
      prior_stored_nutrition: product.nutrition,
    },
  };

  console.log(
    JSON.stringify(
      {
        slug: product.slug,
        name: product.name,
        dry_run: dryRun,
        stored_nutrition: nutrition,
        display_after_reconcile: display,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const { error: updErr } = await supabase
    .from("products")
    .update({
      nutrition,
      ocr_payload: ocrPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id);
  if (updErr) throw new Error(updErr.message);

  console.log(`[fix-product-nutrition] updated ${product.slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
