#!/usr/bin/env -S pnpm tsx
/**
 * Search V2 evaluation harness — §15 merge gate.
 *
 *   pnpm search:eval
 *
 * Hard gate: forbidden-leak rate = 0
 * Reports: precision@5, latency p50, llm_calls/search
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { extractNumericConstraints } from "@/lib/search/v2/numeric-constraints";
import { runSearchV2 } from "@/lib/search/v2/pipeline";
import type { CalibrationBin } from "@/lib/search/v2/trait-calibration";
import { saveCalibrationBins } from "@/lib/search/v2/trait-calibration";

config({ path: ".env.local" });
process.env.SEARCH_EVAL_USE_MEMORY = "1";

type EvalCase = {
  id: string;
  query: string;
  must_include_patterns: string[];
  must_exclude_patterns: string[];
  kind?: string;
  min_results?: number;
  expected_bucket_ids?: string[];
  expected_top1_patterns?: string[];
};

function loadCases(): EvalCase[] {
  const raw = readFileSync(join(process.cwd(), "eval/search-cases.json"), "utf8");
  return JSON.parse(raw) as EvalCase[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPattern(hay: string, pat: string, mode: "include" | "exclude"): boolean {
  const p = pat.toLowerCase().trim();
  if (!p) return false;
  if (mode === "exclude" && p.length <= 5) {
    return new RegExp(`\\b${escapeRegex(p)}\\b`, "i").test(hay);
  }
  if (hay.includes(p)) return true;
  if (p.endsWith("s") && hay.includes(p.slice(0, -1))) return true;
  if (!p.endsWith("s") && hay.includes(`${p}s`)) return true;
  return false;
}

function matchesAny(text: string, patterns: string[], mode: "include" | "exclude" = "include"): boolean {
  const hay = text.toLowerCase();
  return patterns.some((p) => matchesPattern(hay, p, mode));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

function updateCalibrationFromRun(
  traitConfidences: Array<{ trait: string; raw: number; hit: boolean }>,
): void {
  const path = join(process.cwd(), "eval", "trait-calibration.json");
  const existing: CalibrationBin[] = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as CalibrationBin[])
    : [];

  const bins = new Map<string, { hits: number; n: number; rawSum: number }>();
  for (const row of traitConfidences) {
    const key = `${row.trait}:${Math.floor(row.raw * 10)}`;
    const b = bins.get(key) ?? { hits: 0, n: 0, rawSum: 0 };
    b.n += 1;
    b.rawSum += row.raw;
    if (row.hit) b.hits += 1;
    bins.set(key, b);
  }

  const merged = [...existing];
  for (const [key, stat] of bins) {
    const [trait, bucket] = key.split(":");
    const raw_min = Number(bucket) / 10;
    const raw_max = raw_min + 0.1;
    const observed_accuracy = stat.n > 0 ? stat.hits / stat.n : 0.5;
    const idx = merged.findIndex(
      (b) => b.trait === trait && b.raw_min === raw_min && b.raw_max === raw_max,
    );
    const entry: CalibrationBin = {
      trait: trait as CalibrationBin["trait"],
      raw_min,
      raw_max,
      observed_accuracy,
      n: stat.n,
    };
    if (idx >= 0) merged[idx] = entry;
    else merged.push(entry);
  }
  saveCalibrationBins(merged);
  writeFileSync(path, JSON.stringify(merged, null, 2));
}

async function main() {
  const cases = loadCases();
  let failed = 0;
  let leaks = 0;
  let passed = 0;
  let precisionHits = 0;
  let precisionTotal = 0;
  let top1Hits = 0;
  let top1Total = 0;
  const latencies: number[] = [];
  const llmCalls: number[] = [];
  const traitSamples: Array<{ trait: string; raw: number; hit: boolean }> = [];

  console.log(`[search:eval] running ${cases.length} cases…`);

  for (const c of cases) {
    const result = await runSearchV2(c.query, { limit: 10 });
    latencies.push(result.latency_ms);
    llmCalls.push(result.llm_calls);

    const names = result.items.map((i) => `${i.row.name} ${i.row.brand ?? ""} ${i.row.primary_type ?? ""}`);

    let caseOk = true;

    for (const pattern of c.must_exclude_patterns) {
      for (const name of names) {
        if (matchesAny(name, [pattern], "exclude")) {
          console.error(`[LEAK] ${c.id} "${c.query}" — forbidden "${pattern}" in: ${name.slice(0, 80)}`);
          leaks++;
          caseOk = false;
        }
      }
    }

    if (c.must_include_patterns.length && result.items.length > 0) {
      const top5 = result.items.slice(0, 5);
      const anyHitTop5 = top5.some((i) => {
        const blob = `${i.row.name} ${i.row.brand} ${i.row.primary_type} ${i.row.search_doc}`;
        return matchesAny(blob, c.must_include_patterns);
      });
      if (anyHitTop5) precisionHits++;
      precisionTotal++;

      const anyHit = result.items.some((i) => {
        const blob = `${i.row.name} ${i.row.brand} ${i.row.primary_type} ${i.row.search_doc}`;
        return matchesAny(blob, c.must_include_patterns);
      });
      if (!anyHit) {
        console.error(`[MISS] ${c.id} "${c.query}" — no must_include match in top ${result.items.length}`);
        caseOk = false;
      }
    }

    if (c.expected_top1_patterns?.length && result.items[0]) {
      top1Total++;
      const blob = `${result.items[0].row.name} ${result.items[0].row.brand} ${result.items[0].row.search_doc}`;
      if (matchesAny(blob, c.expected_top1_patterns)) top1Hits++;
      else {
        console.warn(`[top1] ${c.id} — top result missed expected pattern`);
      }
    }

    if (c.expected_bucket_ids?.length && result.buckets) {
      const ids = new Set(result.buckets.map((b) => b.id));
      for (const expected of c.expected_bucket_ids) {
        if (!ids.has(expected)) {
          console.error(`[BUCKET] ${c.id} missing bucket "${expected}"`);
          caseOk = false;
        }
      }
    }

    if (c.kind && result.intent.kind !== c.kind) {
      console.warn(`[intent] ${c.id} kind ${result.intent.kind} (expected ${c.kind})`);
    }

    const numeric = extractNumericConstraints(c.query);
    if (c.query.includes("₹") && numeric.max_price == null) {
      console.warn(`[numeric] ${c.id} expected price constraint`);
    }

    const minResults = c.min_results ?? (c.must_include_patterns.length ? 1 : c.kind === "goal" ? 3 : 0);
    if (minResults > 0 && result.items.length < minResults) {
      console.error(
        `[EMPTY] ${c.id} "${c.query}" — ${result.items.length} results (need ${minResults})`,
      );
      caseOk = false;
    }

    for (const item of result.items.slice(0, 3)) {
      for (const [trait, conf] of Object.entries(item.row.trait_confidence)) {
        if (item.row.trait_source[trait as keyof typeof item.row.trait_source] !== "llm") continue;
        const hit = c.must_include_patterns.length
          ? matchesAny(
              `${item.row.name} ${item.row.search_doc}`,
              c.must_include_patterns,
            )
          : true;
        traitSamples.push({ trait, raw: conf ?? 0.5, hit });
      }
    }

    if (caseOk) passed++;
    else failed++;
  }

  const precisionAt5 = precisionTotal > 0 ? precisionHits / precisionTotal : 1;
  const top1Acc = top1Total > 0 ? top1Hits / top1Total : 1;
  const latencyP50 = percentile(latencies, 0.5);
  const avgLlm = llmCalls.length ? llmCalls.reduce((a, b) => a + b, 0) / llmCalls.length : 0;

  if (traitSamples.length && process.env.SEARCH_EVAL_CALIBRATION === "1") {
    updateCalibrationFromRun(traitSamples);
  }

  console.log(`\n[search:eval] ${passed}/${cases.length} passed, ${leaks} forbidden leaks`);
  console.log(`[search:eval] precision@5=${precisionAt5.toFixed(3)} top1=${top1Acc.toFixed(3)}`);
  console.log(`[search:eval] latency p50=${latencyP50.toFixed(0)}ms llm_calls/search=${avgLlm.toFixed(2)}`);

  if (leaks > 0) {
    console.error("\n[search:eval] FAIL — forbidden-leak rate must be 0");
    process.exit(1);
  }
  if (failed > 0) {
    console.error(`\n[search:eval] FAIL — ${failed} case(s) failed`);
    process.exit(1);
  }
  if (precisionAt5 < 0.8 && precisionTotal >= 10) {
    console.error(`[search:eval] FAIL — precision@5 ${precisionAt5.toFixed(3)} below 0.8 target`);
    process.exit(1);
  }
  console.log("[search:eval] PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
