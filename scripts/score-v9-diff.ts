#!/usr/bin/env -S pnpm tsx
/**
 * Phase 3: side-by-side V8 vs V9 on the same SKUs (required before cutover).
 *
 *   pnpm score:v9:diff -- --limit=500
 *   pnpm score:v9:diff -- --names=masala,tea,dahi,cola,biscuit
 */

import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { computeCoreScore } from "@/lib/scoring/core";
import { computeCoreScoreV9ForRow, preloadV9ForProducts } from "@/lib/scoring/v9-batch";
import { VERDICT_LABELS } from "@/lib/scoring/verdict";
import type { ScoreableProduct } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

const SANITY_PATTERNS = [
  { label: "masala", re: /masala|spice|seasoning/i },
  { label: "tea", re: /\btea\b|chai\b/i },
  { label: "dahi", re: /dahi|yogurt|curd/i },
  { label: "cola", re: /cola|pepsi|coke|soda/i },
  { label: "biscuit", re: /biscuit|cookie/i },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit = 500;
  let nameFilter: RegExp | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]) || 500;
    if (a.startsWith("--names=")) {
      const parts = a.split("=")[1]!.split(",").map((s) => s.trim());
      const patterns = SANITY_PATTERNS.filter((p) => parts.includes(p.label));
      if (patterns.length) {
        nameFilter = new RegExp(
          patterns.map((p) => p.re.source).join("|"),
          "i",
        );
      }
    }
  }
  return { limit, nameFilter, csv: argv.includes("--csv") };
}

function deltaBucket(d: number): string {
  if (d >= 15) return "v9_much_higher";
  if (d >= 5) return "v9_higher";
  if (d <= -15) return "v9_much_lower";
  if (d <= -5) return "v9_lower";
  return "similar";
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();

  let query = supabase
    .from("products")
    .select("id, name, category, subcategory, ingredients_raw, nutrition, attributes")
    .not("nutrition", "is", null)
    .limit(args.limit * 3);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as ScoreableProduct[];
  if (args.nameFilter) {
    rows = rows.filter((r) => args.nameFilter!.test(r.name ?? ""));
  }
  rows = rows.slice(0, args.limit);

  console.log(`[score-v9-diff] scoring ${rows.length} products…`);

  const preload = await preloadV9ForProducts(supabase, rows);

  const buckets: Record<string, number> = {};
  const lines: string[] = [];

  for (const row of rows) {
    const v8 = computeCoreScore({
      ingredients_raw: row.ingredients_raw,
      nutrition: row.nutrition as ProductNutrition | null,
      category: row.category,
      subcategory: row.subcategory,
      product_name: row.name,
      attributes: row.attributes,
    });
    const v9 = computeCoreScoreV9ForRow(row, preload);
    const d = v9.score - v8.score;
    const bucket = deltaBucket(d);
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;

    const verdictTitle = VERDICT_LABELS[v9.verdict].title;
    const chips = v9.verdict_sublabel_display.join(", ") || "—";
    const line = [
      (row.name ?? "").slice(0, 42),
      `v8=${v8.score}`,
      `v9=${v9.score}`,
      `Δ${d >= 0 ? "+" : ""}${d}`,
      `abs=${v9.absolute_score}`,
      `rel=${v9.relative_score}`,
      `role=${v9.role_cohort}`,
      verdictTitle,
      chips,
    ].join(" | ");

    lines.push(line);
    if (args.csv) {
      console.log(
        [
          JSON.stringify(row.name),
          v8.score,
          v9.score,
          d,
          v9.absolute_score,
          v9.relative_score,
          v9.role_cohort,
          v9.verdict,
          v9.verdict_sublabels.join(";"),
        ].join(","),
      );
    }
  }

  if (!args.csv) {
    console.log("\n--- Sample rows (largest |Δ| first) ---\n");
    const sorted = [...lines].sort((a, b) => {
      const da = Math.abs(Number(a.match(/Δ([+-]?\d+)/)?.[1] ?? 0));
      const db = Math.abs(Number(b.match(/Δ([+-]?\d+)/)?.[1] ?? 0));
      return db - da;
    });
    for (const l of sorted.slice(0, 40)) console.log(l);
  }

  console.log("\n--- Delta distribution ---");
  for (const [k, v] of Object.entries(buckets).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  const avgDelta =
    lines.length > 0
      ? lines.reduce((s, l) => s + Number(l.match(/Δ([+-]?\d+)/)?.[1] ?? 0), 0) /
        lines.length
      : 0;
  console.log(`\n[score-v9-diff] n=${lines.length} mean_Δ=${avgDelta.toFixed(1)}`);
  console.log(
    "[score-v9-diff] Review masala/tea (should not rank as staples), dahi (staple), cola/biscuit (treat/skip).",
  );
  console.log(
    "[score-v9-diff] Cutover when satisfied: SCORING_ENGINE=v9 SCORING_RULE_VERSION=9 pnpm score -- --force",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
