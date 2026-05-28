#!/usr/bin/env -S pnpm tsx
/**
 * Patch known LLM classification errors in ingredient_intelligence.
 * Run once: pnpm exec tsx scripts/patch-ingredient-corrections.ts
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";

const CORRECTIONS: Array<{
  normalized_name: string;
  nova_class?: number;
  concern_tier?: string;
  role?: string;
  concern_reasons?: string[];
  display_name?: string;
  intrinsic_quality?: number;
}> = [
  // Salt — NOVA 1, watchful (sodium-sensitive populations)
  {
    normalized_name: "salt",
    nova_class: 1,
    concern_tier: "watchful",
    role: "flavor",
    concern_reasons: ["High sodium; use sparingly if sodium-sensitive or hypertensive"],
    intrinsic_quality: 60,
  },
  // FOS — prebiotic fiber, beneficial (not just a sweetener)
  {
    normalized_name: "fructooligosaccharides",
    nova_class: 1,
    concern_tier: "innocuous",
    role: "probiotic",
    concern_reasons: [],
    display_name: "FOS (Fructooligosaccharides)",
    intrinsic_quality: 80,
  },
  // FOS short form
  {
    normalized_name: "fos",
    nova_class: 1,
    concern_tier: "innocuous",
    role: "probiotic",
    concern_reasons: [],
    display_name: "FOS (Prebiotic fiber)",
    intrinsic_quality: 80,
  },
  // Maltitol — watchful (digestive discomfort)
  {
    normalized_name: "maltitol",
    nova_class: 2,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Sugar alcohol; can cause bloating or laxative effect in sensitive individuals"],
    intrinsic_quality: 45,
  },
  // Polydextrose — watchful, NOVA 4 (synthetic polymer filler)
  {
    normalized_name: "polydextrose",
    nova_class: 4,
    concern_tier: "watchful",
    role: "starch",
    concern_reasons: ["Synthetic polymer bulking agent (E1200); no nutritional value"],
    intrinsic_quality: 30,
  },
  // Erythritol — watchful (FODMAP / digestive at high doses)
  {
    normalized_name: "erythritol",
    nova_class: 3,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Polyol sugar alcohol; may cause digestive discomfort in FODMAP-sensitive individuals"],
    intrinsic_quality: 50,
  },
  // Stevia — keep NOVA 1, flag as watchful for transparency
  {
    normalized_name: "stevia",
    nova_class: 1,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Plant-derived sweetener; long-term safety data limited"],
    intrinsic_quality: 65,
  },
  // Sugar — watchful baseline for high amounts
  {
    normalized_name: "sugar",
    nova_class: 2,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Refined sugar; contributes to blood sugar spikes and excess calories"],
    intrinsic_quality: 25,
  },
  // Refined wheat flour (maida) — clearly watchful
  {
    normalized_name: "maida",
    nova_class: 4,
    concern_tier: "watchful",
    role: "starch",
    concern_reasons: ["Refined flour; stripped of fiber and nutrients", "High glycemic index"],
    intrinsic_quality: 20,
  },
  {
    normalized_name: "refined wheat flour",
    nova_class: 4,
    concern_tier: "watchful",
    role: "starch",
    concern_reasons: ["Refined flour; stripped of fiber and nutrients", "High glycemic index"],
    intrinsic_quality: 20,
  },
  // Artificial sweeteners
  {
    normalized_name: "acesulfame potassium",
    nova_class: 4,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Synthetic sweetener; some studies suggest potential gut microbiome impact"],
    intrinsic_quality: 35,
  },
  {
    normalized_name: "sucralose",
    nova_class: 4,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Synthetic sweetener; may affect gut microbiome at high doses"],
    intrinsic_quality: 35,
  },
  // Palm oil — watchful for environment + sat fat
  {
    normalized_name: "palm oil",
    nova_class: 2,
    concern_tier: "watchful",
    role: "fat",
    concern_reasons: ["High in saturated fat"],
    intrinsic_quality: 35,
  },
  // High fructose corn syrup
  {
    normalized_name: "high fructose corn syrup",
    nova_class: 4,
    concern_tier: "problematic",
    role: "sweetener",
    concern_reasons: ["Ultra-processed liquid sugar; strongly associated with metabolic disorders"],
    intrinsic_quality: 5,
  },
  // Invert sugar
  {
    normalized_name: "invert sugar",
    nova_class: 3,
    concern_tier: "watchful",
    role: "sweetener",
    concern_reasons: ["Processed sugar with high fructose content"],
    intrinsic_quality: 20,
  },
];

async function main() {
  const s = adminClient();
  let updated = 0;
  for (const patch of CORRECTIONS) {
    const { error } = await s.from("ingredient_intelligence").upsert({
      ...patch,
      model: "manual_correction",
      rated_at: new Date().toISOString(),
    }, { onConflict: "normalized_name" });
    if (error) {
      console.error(`FAIL ${patch.normalized_name}: ${error.message}`);
    } else {
      console.log(`OK   ${patch.normalized_name} → NOVA ${patch.nova_class} · ${patch.concern_tier}`);
      updated++;
    }
  }
  console.log(`\nPatched ${updated}/${CORRECTIONS.length} rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
