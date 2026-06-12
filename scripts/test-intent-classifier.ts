#!/usr/bin/env -S pnpm tsx
/**
 * Test the local intent classifier against the ground-truth test database.
 * Pure TypeScript — no HTTP, no Python service needed.
 *
 *   pnpm intent:test
 *   pnpm intent:test -- --verbose
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyIntent } from "@/lib/search/intent-classifier";
import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";

type TestQuery = {
  query: string;
  expected_kind: string;
  expected_brand: string | null;
  expected_type: string | null;
  expected_goal: string | null;
  notes: string;
};

type TestResult = {
  query: string;
  status: "pass" | "fail" | "degraded" | "error";
  expected: {
    kind: string;
    brand: string | null;
    type: string | null;
    goal: string | null;
  };
  actual: {
    kind?: string;
    brand?: string | null;
    type?: string | null;
    goal?: string | null;
    confidence?: number;
  };
  notes: string;
  errors: string[];
};

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    verbose: argv.includes("--verbose"),
  };
}

async function main() {
  const { verbose } = parseArgs();
  const repoRoot = join(import.meta.dirname ?? ".", "..");
  const testFile = join(repoRoot, "data", "search-test-queries.json");
  const queries: TestQuery[] = JSON.parse(readFileSync(testFile, "utf8"));

  const brands = [
    "amul", "nestle", "carbamide", "patanjali", "karachi bakery",
    "haldiram", "taj mahal tea", "dabur", "britannia", "epigamia",
    "mother dairy", "hershey",
  ];
  const primaryTypes = [
    "milk", "biscuits", "paneer", "ghee", "bread", "chocolate",
    "ice cream", "olive oil", "coconut water", "fruit juice",
    "butter", "bhujia", "yogurt", "honey", "snacks", "protein",
    "protein bar", "protein shake", "protein powder",
    "kewra water", "juice", "chai", "atta", "dal", "rice",
    "chicken masala", "dosa batter", "chocolate milkshake",
    "chocolate syrup", "coconut oil",
    "snack", "green tea", "pasta", "instant noodles",
    "ready to eat", "rose water",
  ];

  const meta: IndexCatalogMeta = {
    brands: new Set(brands),
    primaryTypes: new Set(primaryTypes),
    flavours: new Set(),
  };

  console.log(`[test] Running ${queries.length} test queries locally (0ms, no HTTP)\n`);

  const results: TestResult[] = [];

  for (const q of queries) {
    const expected = {
      kind: q.expected_kind,
      brand: q.expected_brand,
      type: q.expected_type,
      goal: q.expected_goal,
    };

    try {
      const raw = classifyIntent(q.query, meta);

      if (!raw || raw.confidence < 0.70) {
        results.push({
          query: q.query,
          status: "degraded",
          expected,
          actual: {
            kind: raw?.kind ?? "null",
            brand: raw?.brand ?? null,
            type: raw?.primary_type ?? null,
            goal: raw?.goal_phrase ?? null,
            confidence: raw?.confidence ?? 0,
          },
          notes: q.notes,
          errors: [],
        });
        continue;
      }

      const actual = {
        kind: raw.kind,
        brand: raw.brand ?? null,
        type: raw.primary_type ?? null,
        goal: raw.goal_phrase ?? null,
        confidence: raw.confidence,
      };

      // Compare expected vs actual
      const errors: string[] = [];

      if (expected.kind !== actual.kind) {
        errors.push(`kind: expected "${expected.kind}", got "${actual.kind}"`);
      }

      const expBrand = expected.brand?.toLowerCase() ?? null;
      const actBrand = actual.brand?.toLowerCase().trim() ?? null;
      if (expBrand && actBrand !== expBrand) {
        errors.push(`brand: expected "${expBrand}", got "${actBrand}"`);
      }

      const expType = expected.type?.toLowerCase() ?? null;
      const actType = actual.type?.toLowerCase() ?? null;
      if (expType && (!actType || !actType.includes(expType))) {
        errors.push(`type: expected "${expType}", got "${actType}"`);
      }

      const expGoal = expected.goal?.toLowerCase() ?? null;
      const actGoal = actual.goal?.toLowerCase() ?? null;
      if (expGoal && (!actGoal || !actGoal.includes(expGoal))) {
        errors.push(`goal: expected "${expGoal}", got "${actGoal}"`);
      }

      results.push({
        query: q.query,
        status: errors.length === 0 ? "pass" : "fail",
        expected,
        actual,
        notes: q.notes,
        errors,
      });

    } catch (e) {
      results.push({
        query: q.query,
        status: "error",
        expected,
        actual: {},
        notes: q.notes,
        errors: [(e as Error).message.slice(0, 60)],
      });
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const degraded = results.filter((r) => r.status === "degraded");
  const errors = results.filter((r) => r.status === "error");

  const handled = results.filter((r) => r.status !== "degraded" && r.status !== "error");
  const accuracy = handled.length > 0
    ? Math.round((passed.length / handled.length) * 100)
    : 0;

  console.log("═══════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════");
  console.log(`  Total queries:     ${results.length}`);
  console.log(`  ✅ Passed:          ${passed.length} (${accuracy}% of handled)`);
  console.log(`  ❌ Failed:          ${failed.length}`);
  console.log(`  ⬇ Degraded to LLM: ${degraded.length}`);
  console.log(`  ⚠ Errors:           ${errors.length}`);
  console.log("");

  if (failed.length) {
    console.log("── FAILURES ──");
    for (const r of failed) {
      console.log(`  ❌ ${r.query}`);
      console.log(`     expected: kind=${r.expected.kind} brand=${r.expected.brand} type=${r.expected.type} goal=${r.expected.goal}`);
      console.log(`     actual:   kind=${r.actual.kind} brand=${r.actual.brand} type=${r.actual.type} goal=${r.actual.goal}`);
      console.log(`     ${r.notes}`);
      for (const e of r.errors) console.log(`     → ${e}`);
      console.log("");
    }
  }

  if (degraded.length && verbose) {
    console.log("── DEGRADED TO LLM ──");
    for (const r of degraded) {
      console.log(`  ⬇ ${r.query} (confidence: ${(r.actual.confidence ?? 0).toFixed(2)})`);
      console.log(`     ${r.notes}`);
    }
    console.log("");
  }

  console.log("── BY EXPECTED KIND ──");
  for (const kind of ["brand", "directed", "goal", "ambiguous"]) {
    const cat = results.filter((r) => r.expected.kind === kind);
    const catPass = cat.filter((r) => r.status === "pass").length;
    const catDegrade = cat.filter((r) => r.status === "degraded").length;
    console.log(`  ${kind.padEnd(12)} ${catPass}/${cat.length} pass  (${catDegrade} degraded)`);
  }

  if (failed.length > 0 || errors.length > 0) {
    console.log(`\n❌ ${failed.length + errors.length} failures/errors`);
    process.exit(1);
  }

  console.log(`\n✅ All ${passed.length} handled queries passed. ${degraded.length} degraded to LLM.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
