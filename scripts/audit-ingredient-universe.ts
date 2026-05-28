#!/usr/bin/env -S pnpm tsx
/**
 * Deep audit of unique ingredient tokens before LLM rating.
 *   pnpm exec tsx scripts/audit-ingredient-universe.ts
 */
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  isGenericIngredientCategory,
  isIngredientBoilerplate,
} from "@/lib/scoring/ingredient-generic-heads";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";

config({ path: ".env.local" });

type Bucket =
  | "ins_e_number"
  | "single_word_food"
  | "multi_word"
  | "very_long_phrase"
  | "ocr_junk"
  | "percent_or_number"
  | "marketing"
  | "other";

function classify(name: string): Bucket {
  const n = name.toLowerCase().trim();
  if (/^[\d.%\s\-]+$/.test(n) || /^\d+(\.\d+)?\s*%$/.test(n)) return "percent_or_number";
  if (/^[\]}\),*&.\s]/.test(n) || /[\]{}]/.test(n)) return "ocr_junk";
  if (/\b(contains|may contain|allergen|manufactured|packed|best before|store in)\b/.test(n)) {
    return "marketing";
  }
  if (n.length > 48) return "very_long_phrase";
  if (/^(ins|e)\s*\d{3,4}[a-z]?(\s*\([ivx]+\))?$/i.test(n) || /^e\d{3,4}$/i.test(n)) {
    return "ins_e_number";
  }
  if (!n.includes(" ") && n.length <= 24) return "single_word_food";
  if (n.includes(" ")) return "multi_word";
  return "other";
}

function shouldRate(name: string): boolean {
  if (isGenericIngredientCategory(name) || isIngredientBoilerplate(name)) return false;
  const b = classify(name);
  return b !== "ocr_junk" && b !== "percent_or_number" && b !== "marketing";
}

async function main() {
  const supabase = adminClient();
  const freq = new Map<string, number>();
  let products = 0;
  let segmentsTotal = 0;
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
      products++;
      const raw = row.ingredients_raw as string;
      const segs = raw.split(/[,;]/).length;
      segmentsTotal += segs;
      for (const ing of uniqueIngredientsFromList(raw)) {
        freq.set(ing, (freq.get(ing) ?? 0) + 1);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const unique = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const buckets = new Map<Bucket, number>();
  const bucketExamples = new Map<Bucket, string[]>();

  let rateable = 0;
  let singleton = 0;
  let singletonRateable = 0;

  for (const [name, count] of unique) {
    const b = classify(name);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
    const ex = bucketExamples.get(b) ?? [];
    if (ex.length < 5) ex.push(name);
    bucketExamples.set(b, ex);

    if (shouldRate(name)) {
      rateable++;
      if (count === 1) singletonRateable++;
    }
    if (count === 1) singleton++;
  }

  const { count: ratedCount } = await supabase
    .from("ingredient_intelligence")
    .select("*", { count: "exact", head: true });

  const lmCallsAt4 = Math.ceil(rateable / 4);
  const lmCallsAt8 = Math.ceil(rateable / 8);

  console.log("=== Ingredient universe audit ===\n");
  console.log(`Products with ingredients: ${products.toLocaleString()}`);
  console.log(`~Comma segments (rough):   ${segmentsTotal.toLocaleString()}`);
  console.log(`Unique atomic tokens:      ${unique.length.toLocaleString()}`);
  console.log(`Already in intelligence:   ${ratedCount ?? "?"}`);
  console.log(`Singleton tokens (1 SKU):  ${singleton.toLocaleString()} (${((singleton / unique.length) * 100).toFixed(1)}%)`);
  console.log(`Rateable (after filters):  ${rateable.toLocaleString()}`);
  console.log(`  └ singleton rateable:    ${singletonRateable.toLocaleString()}`);
  console.log(`\nLM batches needed: @4=${lmCallsAt4.toLocaleString()}  @8=${lmCallsAt8.toLocaleString()}  (@8 ≈ ${((1 - lmCallsAt8 / lmCallsAt4) * 100).toFixed(0)}% fewer calls)\n`);

  console.log("Buckets (token types):");
  for (const [b, n] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(6)}  ${b}`);
    for (const ex of bucketExamples.get(b) ?? []) {
      console.log(`           e.g. ${ex.slice(0, 72)}`);
    }
  }

  console.log("\nTop 25 by product frequency (what cache saves most):");
  for (const [name, count] of unique.slice(0, 25)) {
    console.log(`  ${count.toString().padStart(5)}  [${classify(name)}] ${name.slice(0, 64)}`);
  }

  console.log("\nSuspicious singletons (sample, rateable):");
  let shown = 0;
  for (const [name, count] of unique) {
    if (count > 1 || !shouldRate(name)) continue;
    const b = classify(name);
    if (b === "very_long_phrase" || b === "multi_word" || name.length > 35) {
      console.log(`  [${b}] ${name.slice(0, 80)}`);
      if (++shown >= 20) break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
