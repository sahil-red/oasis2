#!/usr/bin/env -S pnpm tsx
/**
 * End-to-end search test: call the search API and verify results.
 * Complements the classifier unit tests (intent:test) by checking
 * the full pipeline: intent → candidates → ranking → results.
 *
 * Tests that:
 * 1. Results are returned (not empty for known-good queries)
 * 2. Results are diverse (not just 1 product for broad queries)
 * 3. No LLM calls for classifier-handled queries
 * 4. Results are actually relevant (brand/type match expectations)
 *
 *   pnpm search:e2e
 *   pnpm search:e2e -- --service http://localhost:3000
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type E2eCase = {
  query: string;
  min_results: number;
  expect_brand?: string | null;
  expect_type?: string | null;
  expect_no_llm?: boolean;
  notes: string;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let service: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--service=")) service = a.split("=")[1]!;
  }
  return { service: service ?? "http://localhost:3000" };
}

async function main() {
  const { service } = parseArgs();

  const cases: E2eCase[] = [
    { query: "amul", min_results: 5, expect_brand: "amul", expect_no_llm: true, notes: "Pure brand" },
    { query: "milk", min_results: 10, expect_no_llm: true, notes: "Pure type" },
    { query: "amul milk", min_results: 3, expect_brand: "amul", expect_no_llm: true, notes: "Brand + type" },
    { query: "paneer", min_results: 10, expect_no_llm: true, notes: "Pure type" },
    { query: "high protein", min_results: 5, expect_no_llm: true, notes: "Bare modifier — must return many products (not just 1)" },
    { query: "diabetic friendly snacks", min_results: 3, expect_no_llm: false, notes: "Goal + type — may need LLM for precision" },
    { query: "keora", min_results: 1, expect_no_llm: true, notes: "Lexical leg — should find at least 1 result" },
    { query: "vegan milk", min_results: 1, expect_no_llm: false, notes: "Dietary constraint — results may be 0 if no vegan milk" },
    { query: "carbamide", min_results: 3, expect_brand: "carbamide", expect_no_llm: true, notes: "Brand from index" },
    { query: "karachi bakery", min_results: 3, expect_no_llm: true, notes: "Multi-word brand" },
    { query: "vanilla ice cream", min_results: 3, expect_no_llm: true, notes: "Flavour + multi-word type" },
    { query: "biscuits", min_results: 10, expect_no_llm: true, notes: "Pure type" },
    { query: "chocolate milk", min_results: 5, expect_no_llm: true, notes: "Head-noun: should find milk products" },
    { query: "no added sugar juice", min_results: 2, expect_no_llm: false, notes: "Dietary modifier + type" },
    { query: "high protein low sugar", min_results: 3, expect_no_llm: true, notes: "Multiple bare modifiers" },
  ];

  console.log(`[e2e] Testing ${cases.length} queries against ${service}/api/search/ai\n`);

  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (const c of cases) {
    try {
      const res = await fetch(`${service}/api/search/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: c.query, limit: 10, tier: "structured" }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error?.includes("Sign in")) {
          console.log(`  ⚠ ${c.query}: sign-in required (anon quota)`);
          continue;
        }
        console.log(`  ❌ ${c.query}: HTTP ${res.status}`);
        errors++;
        continue;
      }

      const data = (await res.json()) as {
        items?: Array<{ brand?: string; name?: string }>;
        v2?: { llm_calls?: number };
      };
      const count = data.items?.length ?? 0;
      const llmCalls = data.v2?.llm_calls ?? -1;

      const issues: string[] = [];

      if (count < c.min_results) {
        issues.push(`only ${count} results (expected ≥ ${c.min_results})`);
      }

      if (c.expect_brand && data.items?.length) {
        const allMatch = data.items.every((i) =>
          (i.brand ?? "").toLowerCase().includes((c.expect_brand ?? "").toLowerCase()),
        );
        if (!allMatch) {
          const brands = [...new Set(data.items.map((i) => i.brand ?? "?"))].slice(0, 5);
          issues.push(`expected brand "${c.expect_brand}", got: ${brands.join(", ")}`);
        }
      }

      if (c.expect_no_llm && llmCalls > 0) {
        issues.push(`LLM called (${llmCalls}) but classifier should handle this`);
      }

      if (issues.length) {
        console.log(`  ❌ ${c.query}: ${issues.join("; ")}  (${count} results, llm:${llmCalls})`);
        failed++;
      } else {
        console.log(`  ✅ ${c.query}: ${count} results, llm:${llmCalls} — ${c.notes}`);
        passed++;
      }
    } catch (e) {
      console.log(`  ❌ ${c.query}: ${(e as Error).message.slice(0, 60)}`);
      errors++;
    }
  }

  console.log(`\n═══ RESULTS ═══`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⚠ Errors:  ${errors}`);
  console.log(`  Total:     ${cases.length}`);

  if (failed > 0 || errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
