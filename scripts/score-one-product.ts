#!/usr/bin/env -S pnpm tsx
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { persistCoreScoresBatch } from "@/lib/scoring/persist-core";

loadEnv({ path: ".env.local" });

const sku = process.argv.find((a) => a.startsWith("--sku="))?.split("=")[1];
if (!sku) {
  console.error("Usage: pnpm exec tsx scripts/score-one-product.ts -- --sku=...");
  process.exit(1);
}

async function main() {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, subcategory, ingredients_raw, nutrition, attributes")
    .eq("zepto_sku", sku)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error("Product not found");
    process.exit(1);
  }
  const outcome = await persistCoreScoresBatch(supabase, [data], {});
  console.log(outcome);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
