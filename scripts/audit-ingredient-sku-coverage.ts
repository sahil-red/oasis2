#!/usr/bin/env -S pnpm tsx
/** SKU-level ingredient intelligence coverage (DB + local checkpoint). */
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  isGenericIngredientCategory,
  isIngredientBoilerplate,
} from "@/lib/scoring/ingredient-generic-heads";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";

config({ path: ".env.local" });

async function loadRated(): Promise<Set<string>> {
  const rated = new Set<string>();
  const supabase = adminClient();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("ingredient_intelligence")
      .select("normalized_name")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (row.normalized_name) rated.add(row.normalized_name as string);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  try {
    const text = await readFile("data/cache/rate-ingredients/results.jsonl", "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { normalized_name?: string };
        if (row.normalized_name) rated.add(row.normalized_name);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no checkpoint */
  }
  return rated;
}

async function main() {
  const rated = await loadRated();
  const supabase = adminClient();
  const coverages: number[] = [];
  let productsWithIngredients = 0;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("ingredients_raw")
      .not("ingredients_raw", "is", null)
      .range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const tokens = uniqueIngredientsFromList(row.ingredients_raw as string).filter(
        (t) => !isGenericIngredientCategory(t) && !isIngredientBoilerplate(t),
      );
      if (!tokens.length) continue;
      productsWithIngredients++;
      const hit = tokens.filter((t) => rated.has(t)).length;
      coverages.push(hit / tokens.length);
    }
    if (data.length < 500) break;
    offset += 500;
  }

  const pct = (n: number) => `${((n / productsWithIngredients) * 100).toFixed(1)}%`;
  const at = (thr: number) => coverages.filter((c) => c >= thr).length;
  const mean =
    coverages.reduce((a, b) => a + b, 0) / Math.max(1, coverages.length);

  console.log("=== Ingredient intelligence — SKU coverage ===\n");
  console.log(`Rated tokens (db + checkpoint): ${rated.size.toLocaleString()}`);
  console.log(`Products with ingredient lists: ${productsWithIngredients.toLocaleString()}`);
  console.log(`Mean per-SKU token coverage:       ${(mean * 100).toFixed(1)}%\n`);
  console.log(`SKUs at 100% of tokens rated:  ${at(1).toLocaleString()}  (${pct(at(1))})`);
  console.log(`SKUs at ≥90%:                  ${at(0.9).toLocaleString()}  (${pct(at(0.9))})`);
  console.log(`SKUs at ≥80%:                  ${at(0.8).toLocaleString()}  (${pct(at(0.8))})`);
  console.log(`SKUs at ≥50%:                  ${at(0.5).toLocaleString()}  (${pct(at(0.5))})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
