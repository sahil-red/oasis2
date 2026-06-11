#!/usr/bin/env tsx
/**
 * Fix nutrition extraction errors — products with per-pack values mislabeled as per-100g,
 * LLM hallucinated scaling, and index/source desync.
 *
 * Run: npx tsx scripts/fix-nutrition-anomalies.ts
 */
import { adminClient } from "../lib/supabase/admin";

const supabase = adminClient();

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  nutrition: Record<string, unknown> | null;
  category: string | null;
};

/** Products with known bad protein values (instant coffee/tea with 15-35g protein — impossible) */
const COFFEE_TEA_FIXES: Array<{ match: RegExp; fixProtein: number; fixKcal?: number; fixCarbs?: number; fixFat?: number }> = [
  // Bevzilla variants — correct variant has 0.5g protein
  { match: /bevzilla.*hazelnut.*instant.*coffee/i, fixProtein: 0.5, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Tetley Kashmiri Kahwa — tea with 34.8g protein is wrong
  { match: /tetley.*kahwa/i, fixProtein: 2, fixKcal: 10, fixCarbs: 1, fixFat: 0 },
  // Twinings green tea
  { match: /twinings.*green tea/i, fixProtein: 2, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // NutroVally blue pea flower tea
  { match: /nutrovally.*blue pea/i, fixProtein: 2, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Davidoff instant coffee
  { match: /davidoff.*instant.*coffee/i, fixProtein: 1, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Country Bean cocoa mint instant coffee
  { match: /country bean.*cocoa mint/i, fixProtein: 1, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Country Bean instant coffee (any variant)
  { match: /country bean.*instant.*coffee/i, fixProtein: 1, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Brew & Bliss Irish Cream instant coffee
  { match: /brew.*bliss.*irish cream/i, fixProtein: 1, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Toffee Coffee Roasters
  { match: /toffee coffee/i, fixProtein: 1, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
  // Society herbal tea
  { match: /society.*sroth/i, fixProtein: 2, fixKcal: 5, fixCarbs: 0, fixFat: 0 },
];

async function findAndFixCoffeeTea(): Promise<number> {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, slug, nutrition, category")
    .ilike("category", "%tea%")
    .not("nutrition", "is", null);

  if (error || !products?.length) {
    console.error("Failed to fetch tea/coffee products:", error?.message);
    return 0;
  }

  let fixed = 0;
  for (const p of products) {
    const n = p.nutrition as Record<string, unknown> | null;
    if (!n) continue;
    const protein = n.protein_g_100g;
    if (typeof protein !== "number" || protein <= 12) continue;

    const fix = COFFEE_TEA_FIXES.find((f) => f.match.test(p.name));
    if (!fix) continue;

    const updated = { ...n };
    updated.protein_g_100g = fix.fixProtein;
    if (fix.fixKcal !== undefined) updated.energy_kcal_100g = fix.fixKcal;
    if (fix.fixCarbs !== undefined) updated.carbs_g_100g = fix.fixCarbs;
    if (fix.fixFat !== undefined) updated.fat_g_100g = fix.fixFat;

    const { error: updateErr } = await supabase
      .from("products")
      .update({ nutrition: updated })
      .eq("id", p.id);

    if (updateErr) {
      console.error(`  FAILED to fix "${p.name}": ${updateErr.message}`);
    } else {
      console.log(`  FIXED "${p.name}": protein ${protein}g → ${fix.fixProtein}g`);
      fixed++;
    }
  }
  return fixed;
}

/** Products with protein > 100g or carbs > 100g — clearly per-pack values */
async function findAndFixImpossibleMacros(): Promise<number> {
  // Fetch products with nutrition JSON containing impossible values
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, slug, nutrition, category")
    .not("nutrition", "is", null)
    .limit(5000);

  if (error || !products?.length) {
    console.error("Failed to fetch products:", error?.message);
    return 0;
  }

  let fixed = 0;
  for (const p of products) {
    const n = p.nutrition as Record<string, unknown> | null;
    if (!n) continue;
    const protein = n.protein_g_100g;
    const carbs = n.carbs_g_100g;
    const fat = n.fat_g_100g;

    // Protein > 100g — impossible
    if (typeof protein === "number" && protein > 100) {
      const updated = { ...n, protein_g_100g: null };
      const { error: updateErr } = await supabase
        .from("products")
        .update({ nutrition: updated })
        .eq("id", p.id);
      if (!updateErr) {
        console.log(`  NULLIFIED protein for "${p.name}": was ${protein}g (impossible)`);
        fixed++;
      }
    }

    // Carbs > 100g — impossible
    if (typeof carbs === "number" && carbs > 100) {
      const updated = { ...n, carbs_g_100g: null };
      const { error: updateErr } = await supabase
        .from("products")
        .update({ nutrition: updated })
        .eq("id", p.id);
      if (!updateErr) {
        console.log(`  NULLIFIED carbs for "${p.name}": was ${carbs}g (impossible)`);
        fixed++;
      }
    }

    // Fat > 100g — impossible
    if (typeof fat === "number" && fat > 100) {
      const updated = { ...n, fat_g_100g: null };
      const { error: updateErr } = await supabase
        .from("products")
        .update({ nutrition: updated })
        .eq("id", p.id);
      if (!updateErr) {
        console.log(`  NULLIFIED fat for "${p.name}": was ${fat}g (impossible)`);
        fixed++;
      }
    }
  }
  return fixed;
}

/** Chandan Mouth Freshener — index has 30700 kcal but source has 412. Fix the index. */
async function fixChandanDesync(): Promise<number> {
  const { data: product } = await supabase
    .from("products")
    .select("id, nutrition")
    .ilike("name", "%chandan%mouth freshener%")
    .single();

  if (!product?.nutrition) {
    console.log("  Chandan Mouth Freshener not found or no nutrition data");
    return 0;
  }

  const n = product.nutrition as Record<string, unknown>;
  const kcal = n.energy_kcal_100g;
  if (typeof kcal === "number" && kcal > 1000) {
    // This is clearly wrong — per-pack value. Try to correct by dividing by a reasonable factor.
    // If it's a 30g serving with ~400 kcal/100g, the pack would be ~120 kcal.
    // If the 30700 is from a 30g pack with ~100 kcal/100g, it's way off.
    // Just nullify the kcal — it's unsalvageable without the real label.
    const updated = { ...n, energy_kcal_100g: null };
    const { error } = await supabase
      .from("products")
      .update({ nutrition: updated })
      .eq("id", product.id);
    if (!error) {
      console.log(`  FIXED Chandan Mouth Freshener: nullified kcal (was ${kcal})`);
      return 1;
    }
  }
  return 0;
}

async function main() {
  console.log("=== Fixing nutrition anomalies ===\n");

  console.log("1. Fixing coffee/tea protein errors...");
  const coffeeFixed = await findAndFixCoffeeTea();
  console.log(`   ${coffeeFixed} products fixed\n`);

  console.log("2. Fixing impossible macros (>100g per 100g)...");
  const macroFixed = await findAndFixImpossibleMacros();
  console.log(`   ${macroFixed} fields nullified\n`);

  console.log("3. Fixing Chandan Mouth Freshener index desync...");
  const chandanFixed = await fixChandanDesync();
  console.log(`   ${chandanFixed} products fixed\n`);

  console.log(`=== Done. Total fixes: ${coffeeFixed + macroFixed + chandanFixed} ===`);
}

main().catch(console.error);
