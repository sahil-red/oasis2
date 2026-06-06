#!/usr/bin/env -S pnpm tsx
/**
 * Search V2 evaluation harness — leak-rate must be 0 to pass.
 *
 *   pnpm search:eval
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { parseSearchIntent } from "@/lib/search/intent";
import { runSearchV2 } from "@/lib/search/v2/pipeline";

config({ path: ".env.local" });

type EvalCase = {
  id: string;
  query: string;
  must_include_patterns: string[];
  must_exclude_patterns: string[];
  kind?: string;
  expected_bucket_ids?: string[];
};

function loadCases(): EvalCase[] {
  const raw = readFileSync(join(process.cwd(), "eval/search-cases.json"), "utf8");
  return JSON.parse(raw) as EvalCase[];
}

function matchesAny(text: string, patterns: string[]): boolean {
  const hay = text.toLowerCase();
  return patterns.some((p) => hay.includes(p.toLowerCase()));
}

async function main() {
  const cases = loadCases();
  let failed = 0;
  let leaks = 0;
  let passed = 0;
  const started = Date.now();

  console.log(`[search:eval] running ${cases.length} cases…`);

  for (const c of cases) {
    const intent = parseSearchIntent(c.query);
    const result = await runSearchV2(c.query, { limit: 10 });
    const names = result.items.map((i) => `${i.row.name} ${i.row.brand ?? ""} ${i.row.primary_type ?? ""}`);

    let caseOk = true;

    for (const pattern of c.must_exclude_patterns) {
      for (const name of names) {
        if (matchesAny(name, [pattern])) {
          console.error(`[LEAK] ${c.id} "${c.query}" — forbidden "${pattern}" in: ${name.slice(0, 80)}`);
          leaks++;
          caseOk = false;
        }
      }
    }

    if (c.must_include_patterns.length && result.items.length > 0) {
      const anyHit = result.items.some((i) => {
        const blob = `${i.row.name} ${i.row.brand} ${i.row.primary_type} ${i.row.search_doc}`;
        return matchesAny(blob, c.must_include_patterns);
      });
      if (!anyHit) {
        console.error(`[MISS] ${c.id} "${c.query}" — no must_include match in top ${result.items.length}`);
        caseOk = false;
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

    if (c.kind && intent.kind !== c.kind) {
      console.warn(`[intent] ${c.id} kind ${intent.kind} (expected ${c.kind})`);
    }

    if (result.items.length === 0 && c.must_include_patterns.length) {
      console.error(`[EMPTY] ${c.id} "${c.query}" — zero results`);
      caseOk = false;
    }

    if (caseOk) passed++;
    else failed++;
  }

  const ms = Date.now() - started;
  console.log(`\n[search:eval] ${passed}/${cases.length} passed, ${leaks} forbidden leaks, ${ms}ms`);

  if (leaks > 0) {
    console.error("\n[search:eval] FAIL — forbidden-leak rate must be 0");
    process.exit(1);
  }
  if (failed > 0) {
    console.error(`\n[search:eval] FAIL — ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log("[search:eval] PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
