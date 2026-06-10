#!/usr/bin/env -S pnpm tsx
/**
 * v10 opinion generation — DeepSeek batch runner (see v10-llm-opinion-spec.md).
 *
 *   pnpm opinions -- --limit=50                  # pilot
 *   pnpm opinions -- --resume --concurrency=8    # full run (skips current rule_version)
 *   pnpm opinions -- --sku=<product_id>          # single product
 *
 * Writes core_scores.opinion = { headline, why, caveat?, tone, model,
 * rule_version, generated_at }. Resume skips rows whose opinion is already at
 * the current rule version. Rejected generations are logged, never written —
 * the PDP falls back to rule-based bullets.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { SCORING_RULE_VERSION } from "@/lib/scoring/persist-core";
import {
  generateOpinionBatch,
  type OpinionInput,
  type ProductOpinion,
} from "@/lib/opinions/generate";
import { mapPool } from "@/lib/async-pool";
import { scriptArgv } from "@/lib/util/script-argv";

const OUT_DIR = resolve(process.cwd(), "data/cache/opinions");
const LOG_PATH = resolve(OUT_DIR, `run-${new Date().toISOString().slice(0, 10)}.jsonl`);
const BATCH_SIZE = 8;
const PAGE = 1000; // PostgREST max-rows

type Args = { limit: number; resume: boolean; dryRun: boolean; concurrency: number; sku: string | null };

function parseArgs(): Args {
  const argv = scriptArgv();
  let limit = 0;
  let concurrency = 6;
  let sku: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Math.max(0, Number(a.split("=")[1]) || 0);
    else if (a.startsWith("--concurrency=")) concurrency = Math.max(1, Math.min(20, Number(a.split("=")[1]) || 6));
    else if (a.startsWith("--sku=")) sku = a.slice("--sku=".length).trim() || null;
  }
  return { limit, resume: argv.includes("--resume"), dryRun: argv.includes("--dry-run"), concurrency, sku };
}

type Row = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  price_inr: number | null;
  ingredients_raw: string | null;
  nutrition: Record<string, unknown> | null;
  core_scores: {
    score: number;
    verdict: string | null;
    absolute_score: number | null;
    relative_score: number | null;
    cohort_size: number | null;
    role_cohort: string | null;
    serving_g_effective: number | null;
    verdict_sublabels: string[] | null;
    rule_version: number | null;
    opinion: ProductOpinion | null;
    breakdown: {
      additive_matches?: Array<{ name: string; tier: string }>;
      label_mismatch?: boolean;
    } | null;
  } | null;
};

const SELECT = `id, name, brand, category, subcategory, net_weight, price_inr, ingredients_raw, nutrition,
  core_scores!inner (score, verdict, absolute_score, relative_score, cohort_size, role_cohort,
  serving_g_effective, verdict_sublabels, rule_version, opinion, breakdown)`;

async function loadRows(args: Args): Promise<Row[]> {
  const sb = adminClient();
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    let q = sb
      .from("products")
      .select(SELECT)
      .eq("platform", "zepto")
      .eq("catalog_visible", true)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (args.sku) q = q.eq("id", args.sku);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const got = (data ?? []) as unknown as Row[];
    rows.push(...got);
    if (got.length < PAGE || args.sku) break;
  }
  return rows;
}

function toInput(r: Row): OpinionInput {
  const cs = r.core_scores!;
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    category: r.category,
    subcategory: r.subcategory,
    net_weight: r.net_weight,
    price_inr: r.price_inr,
    score: cs.score,
    verdict: cs.verdict,
    role_cohort: cs.role_cohort,
    absolute_score: cs.absolute_score,
    relative_score: cs.relative_score,
    cohort_size: cs.cohort_size,
    sublabels: (cs.verdict_sublabels ?? []).slice(0, 6),
    nutrition: r.nutrition,
    serving_g: cs.serving_g_effective,
    flagged_additives: (cs.breakdown?.additive_matches ?? []).filter(
      (m) => m.tier === "moderate" || m.tier === "hazardous",
    ),
    label_mismatch: Boolean(cs.breakdown?.label_mismatch),
    ingredients_raw: r.ingredients_raw,
  };
}

function log(entry: Record<string, unknown>) {
  appendFileSync(LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

async function main() {
  const args = parseArgs();
  mkdirSync(OUT_DIR, { recursive: true });
  const sb = adminClient();
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

  const all = await loadRows(args);
  let work = all.filter((r) => r.core_scores);
  if (args.resume) {
    work = work.filter((r) => r.core_scores!.opinion?.rule_version !== SCORING_RULE_VERSION);
  }
  if (args.limit > 0) work = work.slice(0, args.limit);

  console.log(
    `[opinions] scored=${all.length} todo=${work.length} rule_version=${SCORING_RULE_VERSION} batch=${BATCH_SIZE} concurrency=${args.concurrency} dry_run=${args.dryRun}`,
  );
  if (!work.length) return;

  const batches: Row[][] = [];
  for (let i = 0; i < work.length; i += BATCH_SIZE) batches.push(work.slice(i, i + BATCH_SIZE));

  let done = 0;
  let written = 0;
  let rejectedCount = 0;
  let failedBatches = 0;

  await mapPool(batches, args.concurrency, async (batch) => {
    const inputs = batch.map(toInput);
    try {
      const { ok, rejected } = await generateOpinionBatch(inputs);
      for (const rej of rejected) {
        rejectedCount++;
        log({ kind: "rejected", id: rej.id, reason: rej.reason });
      }
      for (const [id, o] of ok) {
        const opinion: ProductOpinion = {
          ...o,
          model,
          rule_version: SCORING_RULE_VERSION,
          generated_at: new Date().toISOString(),
        };
        log({ kind: "ok", id, ...opinion });
        if (!args.dryRun) {
          const { error } = await sb.from("core_scores").update({ opinion }).eq("product_id", id);
          if (error) {
            log({ kind: "write_error", id, error: error.message });
            continue;
          }
          written++;
        }
      }
    } catch (err) {
      failedBatches++;
      log({ kind: "batch_error", ids: batch.map((b) => b.id), error: err instanceof Error ? err.message : String(err) });
    } finally {
      done += batch.length;
      if (done % 80 < BATCH_SIZE) {
        console.log(`[opinions] ${done}/${work.length} written=${written} rejected=${rejectedCount} failed_batches=${failedBatches}`);
      }
    }
  });

  console.log(
    `[opinions] done processed=${done} written=${written} rejected=${rejectedCount} failed_batches=${failedBatches} log=${LOG_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
