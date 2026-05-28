#!/usr/bin/env -S pnpm tsx
/** Audit what uniqueIngredientsFromList extracts vs generic label heads. */
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { isGenericIngredientCategory } from "@/lib/scoring/ingredient-generic-heads";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";

config({ path: ".env.local" });

async function main() {
  const supabase = adminClient();
  const seen = new Map<string, number>();
  let productCount = 0;
  const examples: { token: string; snippet: string }[] = [];
  const pageSize = 500;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("ingredients_raw")
      .not("ingredients_raw", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      productCount++;
      const raw = row.ingredients_raw as string;
      for (const ing of uniqueIngredientsFromList(raw)) {
        seen.set(ing, (seen.get(ing) ?? 0) + 1);
        if (isGenericIngredientCategory(ing) && examples.length < 15) {
          const idx = raw.toLowerCase().indexOf(ing.slice(0, 8));
          examples.push({
            token: ing,
            snippet: raw.slice(Math.max(0, idx - 20), idx + 80).replace(/\s+/g, " "),
          });
        }
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const generic = [...seen.entries()]
    .filter(([k]) => isGenericIngredientCategory(k))
    .sort((a, b) => b[1] - a[1]);

  const { data: ratedGeneric } = await supabase
    .from("ingredient_intelligence")
    .select("normalized_name, role, concern_tier")
    .limit(5000);

  const ratedHeads = (ratedGeneric ?? []).filter((r) =>
    isGenericIngredientCategory(r.normalized_name as string),
  );

  console.log(`Products scanned: ${productCount}`);
  console.log(`Unique tokens total: ${seen.size}`);
  console.log(`Generic head tokens in pipeline: ${generic.length}`);
  console.log("\nTop generic heads (by product frequency):");
  for (const [name, count] of generic.slice(0, 25)) {
    console.log(`  ${count.toString().padStart(5)}  ${name}`);
  }

  console.log("\nExamples in raw lists:");
  for (const ex of examples) {
    console.log(`  [${ex.token}] …${ex.snippet}…`);
  }

  console.log(`\nRated in ingredient_intelligence (generic heads): ${ratedHeads.length}`);
  for (const r of ratedHeads.slice(0, 20)) {
    console.log(`  ${r.normalized_name} → role=${r.role} tier=${r.concern_tier}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
