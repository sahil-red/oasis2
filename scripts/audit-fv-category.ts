#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { matchReferenceFood } from "@/lib/nutrition/reference-seed";

config({ path: ".env.local" });

const PACKAGED_RE =
  /\b(bun|buns|bread|biscuit|cookie|cake|jam|jelly|spread|milk|yogurt|curd|juice|drink|soda|cola|chips|namkeen|snack|bar|mix|powder|syrup|candy|chocolate|ice cream|frozen|pickle|sauce|ketchup|noodle|pasta|cereal|muesli|granola|smoothie|shake|tea|coffee|cream|butter|cheese|paneer|egg|chicken|fish|meat|mutton|puff|wafer|cracker|pizza|burger|sandwich|muffin|pastry|donut|doughnut|kulfi|lollipop|gummy|health drink|malt|horlicks|boost|complan|protein|whey|gainer|supplement|pack|packed|processed|instant|ready|fried|roasted|salted|flavou?red|flavor|masala|spice|oil|ghee|atta|flour|rice|dal|pulse|lentil|honey|marmalade|preserve|can|tin|bottle|pet|pouch|sachet)\b/i;

const PRODUCE_CATEGORY_RE =
  /fresh\s*fruits?|fresh\s*vegetables?|fruits?\s*&\s*vegetables?|vegetables?/i;

async function main() {
  const s = adminClient();
  const pageSize = 1000;
  let offset = 0;
  const inFvCategory: Array<{ name: string; category: string; subcategory: string | null; ref: string | null }> = [];
  const refFilledWrong: string[] = [];

  while (true) {
    const { data, error } = await s
      .from("products")
      .select("name, category, subcategory, super_category, nutrition")
      .eq("platform", "zepto")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const cat = `${row.super_category ?? ""} ${row.category ?? ""} ${row.subcategory ?? ""}`;
      if (!PRODUCE_CATEGORY_RE.test(cat)) continue;

      const name = row.name as string;
      const extra = (row.nutrition as { extra?: Record<string, string> } | null)?.extra;
      const refId = extra?.reference_id ?? null;

      inFvCategory.push({
        name,
        category: row.category as string,
        subcategory: row.subcategory as string | null,
        ref: refId,
      });

      if (PACKAGED_RE.test(name) || PACKAGED_RE.test(`${row.subcategory ?? ""}`)) {
        refFilledWrong.push(name);
      }
    }

    offset += pageSize;
    if (data.length < pageSize) break;
  }

  console.log(`In F&V category (CSV): ${inFvCategory.length}`);
  console.log(`\nSuspicious packaged names in F&V (${refFilledWrong.length}):`);
  for (const n of refFilledWrong.slice(0, 40)) console.log(`  - ${n}`);
  if (refFilledWrong.length > 40) console.log(`  ... +${refFilledWrong.length - 40} more`);

  // Also: reference fill on packaged goods regardless of category
  offset = 0;
  let refProduceWrong = 0;
  const refSamples: string[] = [];
  while (true) {
    const { data, error } = await s
      .from("products")
      .select("name, category, subcategory, nutrition")
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const extra = (row.nutrition as { extra?: Record<string, string> } | null)?.extra;
      if (!extra?.reference_id) continue;
      const name = row.name as string;
      if (PACKAGED_RE.test(name)) {
        refProduceWrong++;
        if (refSamples.length < 30) refSamples.push(`${name} -> ${extra.reference_id}`);
      }
    }
    offset += pageSize;
    if (data.length < pageSize) break;
  }

  console.log(`\nReference-filled packaged goods (any category): ${refProduceWrong}`);
  for (const s of refSamples) console.log(`  - ${s}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
