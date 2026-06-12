#!/usr/bin/env -S pnpm tsx
/**
 * Extract training data for the Python intent classifier.
 * Runs sample queries through the existing LLM intent parser and saves
 * labeled outputs to python-intent/training_data.jsonl.
 *
 *   pnpm intent:extract-training -- --limit=100
 *   pnpm intent:extract-training -- --limit=1000 --quiet
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { parseIntentWithLlm } from "@/lib/search/v2/llm-intent";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname ?? ".", "..");
const OUTPUT_FILE = join(REPO_ROOT, "python-intent", "training_data.jsonl");

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return {
    limit: limit ?? 100,
    quiet: argv.includes("--quiet"),
  };
}

// Diverse query templates covering all intent types
const SAMPLE_QUERIES: string[] = [
  // Brand queries
  "amul",
  "nestle",
  "epigamia",
  "karachi bakery",
  "carbamide",
  "haldiram",
  "taj mahal tea",
  "patanjali",
  "dabur",
  "britannia",

  // Type queries
  "milk",
  "biscuits",
  "paneer",
  "ghee",
  "bread",
  "rice",
  "atta",
  "chocolate",
  "ice cream",
  "chips",

  // Brand + Type
  "amul butter",
  "nestle milk",
  "britannia bread",
  "haldiram bhujia",
  "epigamia yogurt",

  // Constraint queries
  "paneer under 100",
  "high protein snacks",
  "low sugar biscuits",
  "milk under 50",
  "protein bar under 200",
  "no added sugar juice",
  "low fat yogurt",
  "high fiber cereal",

  // Goal queries
  "diabetic friendly snacks",
  "healthy breakfast",
  "gym protein",
  "weight loss snacks",
  "kids tiffin",
  "keto snacks",
  "heart healthy food",
  "pregnancy nutrition",

  // Complex queries
  "what are good high protein snacks for gym",
  "healthy biscuits with low sugar",
  "paneer with low fat under 150",
  "best protein bars for muscle gain",
  "organic honey with no added sugar",

  // Flavour / ingredient
  "keora",
  "vanilla ice cream",
  "chocolate milk",
  "strawberry yogurt",
  "mango juice",
  "rose water",
  "almond milk",
  "coconut water",

  // Ambiguous / short
  "something healthy",
  "best snacks",
  "tasty",
  "good food",
  "cheap",

  // Comparison
  "healthier than maggi",
  "cheaper than amul butter",
  "healthier than coke",

  // Use cases
  "pre workout snack",
  "school lunch ideas",
  "breakfast for kids",
  "post workout protein",
  "evening snacks",

  // Hindi / Hinglish
  "doodh",
  "bina cheeni chai",
  "paneer kam fat wala",
  "healthy khana",
];

async function main() {
  const { limit, quiet } = parseArgs();
  const queries = [...new Set(SAMPLE_QUERIES)].slice(0, limit);

  // Load existing data if any
  const existing: string[] = existsSync(OUTPUT_FILE)
    ? readFileSync(OUTPUT_FILE, "utf8").split("\n").filter(Boolean)
    : [];
  const existingQueries = new Set(
    existing.map((line) => {
      try {
        return (JSON.parse(line) as { query: string }).query;
      } catch {
        return "";
      }
    }),
  );

  const newLines: string[] = [];
  let calls = 0;

  for (const query of queries) {
    if (existingQueries.has(query)) continue;

    try {
      const { intent } = await parseIntentWithLlm(query);
      calls++;

      const example = {
        query,
        kind: intent.kind,
        brand: intent.brand,
        primary_type: intent.primary_type ?? intent.raw_query,
        goal_phrase: intent.goal_phrase,
        modifiers: intent.modifiers,
        sort: intent.sort,
        use_case: intent.use_case,
        confidence: intent.confidence,
        // For training: treat the primary_type as the label when no brand
        label: intent.kind,
      };
      newLines.push(JSON.stringify(example));

      if (!quiet) {
        console.log(
          `[${calls}/${limit}] ${query.padEnd(35)} → kind:${example.kind.padEnd(10)} brand:${(example.brand ?? "-").slice(0, 15)}`,
        );
      }

      // Rate limit: gentle on the LLM API
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      if (!quiet) console.warn(`[${calls}] ${query}: ${(e as Error).message.slice(0, 60)}`);
    }
  }

  // Append new lines
  if (newLines.length) {
    writeFileSync(OUTPUT_FILE, [...existing, ...newLines].join("\n") + "\n");
  }

  console.log(
    `\nDone. ${newLines.length} new examples added. Total: ${existing.length + newLines.length} in ${OUTPUT_FILE}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
