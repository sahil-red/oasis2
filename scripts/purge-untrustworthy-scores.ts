#!/usr/bin/env -S pnpm tsx
/**
 * Remove core_scores (and optionally bad nutrition JSON) for products whose
 * macros are implausible — stale scores survive after scoring rules tighten.
 */
import { config as loadEnv } from "dotenv";
import {
  nutritionHasCriticalAnomalies,
  nutritionMacrosUntrustworthy,
  sanitizeNutrition,
} from "@/lib/nutrition/anomaly";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

async function main() {
  const nameQ = process.argv.find((a) => a.startsWith("--name="))?.split("=")[1];
  const wipeNutrition = process.argv.includes("--wipe-nutrition");
  const supabase = adminClient();
  let offset = 0;
  const page = 100;
  let purgedScores = 0;
  let wipedNutrition = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select("id, name, category, subcategory, nutrition, core_scores(score)")
      .eq("platform", "zepto")
      .not("nutrition", "is", null);
    if (nameQ) q = q.ilike("name", `%${nameQ}%`);

    const { data, error } = await q.range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const nutrition = row.nutrition as ProductNutrition;
      const ctx = {
        name: row.name ?? "",
        category: row.category,
        subcategory: row.subcategory,
      };
      const untrust = nutritionMacrosUntrustworthy(nutrition, ctx);
      const critical = nutritionHasCriticalAnomalies(nutrition, ctx);
      if (!untrust && !critical) continue;

      if (row.core_scores) {
        const { error: delErr } = await supabase
          .from("core_scores")
          .delete()
          .eq("product_id", row.id);
        if (delErr) throw delErr;
        purgedScores++;
        console.log("[score] purged " + row.name);
      }

      if (wipeNutrition && critical) {
        const cleaned = sanitizeNutrition(nutrition, ctx);
        if (cleaned === null || JSON.stringify(cleaned) !== JSON.stringify(nutrition)) {
          await supabase.from("products").update({ nutrition: cleaned }).eq("id", row.id);
          wipedNutrition++;
          console.log("[nutrition] " + (cleaned ? "sanitized" : "cleared") + " " + row.name);
        }
      }
    }

    if (data.length < page) break;
    offset += page;
  }

  console.log(
    `[purge-untrustworthy-scores] scores_removed=${purgedScores} nutrition_updated=${wipedNutrition}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
