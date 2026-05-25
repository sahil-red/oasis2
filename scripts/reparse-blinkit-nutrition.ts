#!/usr/bin/env -S pnpm tsx
/**
 * Re-extract nutrition from saved Blinkit raw_payload (e.g. after parser fix).
 * Updates products.nutrition and re-scores when scoreable.
 */
import { config as loadEnv } from "dotenv";
import { parseBlinkitProductDetail } from "@/lib/grocery/blinkit";
import { adminClient } from "@/lib/supabase/admin";
import { persistCoreScore, hasScoreableNutrition } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

async function main() {
  const skuArg = process.argv.find((a) => a.startsWith("--sku="))?.split("=")[1];
  const supabase = adminClient();
  let offset = 0;
  const page = 50;
  let updated = 0;
  let scored = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select("id, zepto_sku, name, category, subcategory, ingredients_raw, nutrition, attributes, raw_payload")
      .eq("platform", "blinkit")
      .not("raw_payload", "is", null);

    if (skuArg) q = q.eq("zepto_sku", skuArg);

    const { data, error } = await q.range(offset, offset + page - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const attrs = (row.attributes ?? {}) as Record<string, string>;
      const hasBlock = Boolean(attrs["Nutrition Information"]?.trim());
      if (!skuArg && !hasBlock) continue;
      const raw = row.raw_payload as Record<string, unknown> | null;
      if (!raw) continue;

      const parsed = parseBlinkitProductDetail(row.zepto_sku, raw);
      const next = parsed.nutrition;
      const prev = row.nutrition as ProductNutrition | null;
      if (JSON.stringify(prev) === JSON.stringify(next)) continue;

      const { error: upErr } = await supabase
        .from("products")
        .update({
          nutrition: next,
          ingredients_raw: parsed.ingredients_raw ?? row.ingredients_raw,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) {
        console.warn(`update ${row.zepto_sku}:`, upErr.message);
        continue;
      }
      updated++;

      if (hasScoreableNutrition(next)) {
        const r = await persistCoreScore(
          supabase,
          {
            id: row.id,
            name: parsed.name ?? row.name,
            category: row.category,
            subcategory: row.subcategory,
            ingredients_raw: parsed.ingredients_raw ?? row.ingredients_raw,
            nutrition: next,
            attributes: (parsed.attributes ?? row.attributes) as Record<string, string> | null,
          },
          { force: true },
        );
        if (r === "scored") scored++;
      }
    }

    console.log(`[reparse-nutrition] offset=${offset} batch=${data.length} updated=${updated} scored=${scored}`);
    if (data.length < page) break;
    offset += page;
  }

  console.log(`[reparse-nutrition] done. updated=${updated} rescored=${scored}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
