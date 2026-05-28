#!/usr/bin/env -S pnpm tsx
/**
 * Phase 2: LLM-rate unique ingredients → ingredient_intelligence
 *
 *   pnpm rate:ingredients -- --limit=50
 *   pnpm rate:ingredients -- --all
 *   pnpm rate:ingredients -- --batch-size=8   # default; ~50% fewer LM calls vs 4
 *   pnpm rate:ingredients -- --upload-only    # push local checkpoint → Supabase
 *
 * Default (--all): writes data/cache/rate-ingredients/results.jsonl per batch;
 * Supabase upload runs once at the end (avoids mid-run network drops).
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  IngredientLlmParseError,
  rateIngredientsBatchResilient,
  type IngredientIntelligenceRow,
} from "@/lib/scoring/ingredient-llm";
import {
  appendCheckpointRows,
  DEFAULT_INGREDIENT_CHECKPOINT,
  ensureCheckpointDir,
  flushCheckpointToSupabase,
  loadRatedFromCheckpoint,
} from "@/lib/scoring/ingredient-rate-checkpoint";
import {
  isGenericIngredientCategory,
  isIngredientBoilerplate,
} from "@/lib/scoring/ingredient-generic-heads";
import {
  normalizeIngredientName,
  uniqueIngredientsFromList,
} from "@/lib/scoring/normalize-ingredient-name";
import { scriptArgv } from "@/lib/util/script-argv";
import { withRetry } from "@/lib/util/retry";

loadEnv({ path: ".env.local" });

const FREQ_CACHE_PATH = resolve("data/cache/rate-ingredients/frequencies.json");

function parseArgs() {
  const argv = scriptArgv().filter((a) => a.startsWith("--"));
  let limit: number | null = 50;
  let batchSize = 8;
  let checkpoint = DEFAULT_INGREDIENT_CHECKPOINT;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]) || null;
    if (a.startsWith("--batch-size=")) batchSize = Number(a.split("=")[1]) || 8;
    if (a.startsWith("--checkpoint=")) checkpoint = resolve(a.split("=")[1] ?? checkpoint);
  }
  const uploadEachBatch = argv.includes("--upload-each-batch");
  const localOnly = !uploadEachBatch && !argv.includes("--no-local");
  return {
    limit: argv.includes("--all") ? null : limit,
    batchSize: Math.max(1, Math.min(12, batchSize)),
    dryRun: argv.includes("--dry-run"),
    debug: argv.includes("--debug"),
    verbose: argv.includes("--verbose"),
    uploadOnly: argv.includes("--upload-only"),
    skipUpload: argv.includes("--skip-upload"),
    skipSingletons: argv.includes("--skip-singletons"),
    refreshFreqCache: argv.includes("--refresh-freq-cache"),
    checkpoint,
    localOnly,
    uploadEachBatch,
  };
}

function logParseDebug(debug: boolean, label: string, err: unknown) {
  if (!debug) return;
  if (err instanceof IngredientLlmParseError) {
    console.error(
      `[rate:ingredients] [debug] ${label} raw LM response:\n${err.rawResponse.slice(0, 4000)}`,
    );
    return;
  }
  if (err instanceof Error) {
    console.error(`[rate:ingredients] [debug] ${label}: ${err.message}`);
  }
}

/** Global frequency map — rate high-impact tokens first (sugar, salt, …). */
async function collectIngredientFrequencies(
  supabase: ReturnType<typeof adminClient>,
): Promise<Map<string, number>> {
  const freq = new Map<string, number>();
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
      for (const ing of uniqueIngredientsFromList(row.ingredients_raw as string)) {
        freq.set(ing, (freq.get(ing) ?? 0) + 1);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return freq;
}

async function loadFreqCache(): Promise<Map<string, number> | null> {
  try {
    const raw = await readFile(FREQ_CACHE_PATH, "utf8");
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

async function saveFreqCache(freq: Map<string, number>): Promise<void> {
  await ensureCheckpointDir(FREQ_CACHE_PATH);
  const obj = Object.fromEntries(freq);
  await writeFile(FREQ_CACHE_PATH, JSON.stringify(obj), "utf8");
}

async function loadRatedFromDb(
  supabase: ReturnType<typeof adminClient>,
): Promise<Set<string>> {
  const rated = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("ingredient_intelligence")
      .select("normalized_name")
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.code === "42P01") return rated;
      throw error;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.normalized_name) rated.add(row.normalized_name as string);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rated;
}

async function upsertBatch(
  supabase: ReturnType<typeof adminClient>,
  rows: IngredientIntelligenceRow[],
  model: string,
) {
  if (!rows.length) return;
  const rated_at = new Date().toISOString();
  const { error } = await supabase.from("ingredient_intelligence").upsert(
    rows.map((row) => ({
      normalized_name: row.normalized_name,
      display_name: row.display_name,
      nova_class: row.nova_class,
      role: row.role,
      concern_tier: row.concern_tier,
      concern_reasons: row.concern_reasons,
      intrinsic_quality: row.intrinsic_quality,
      synonyms: row.synonyms,
      model,
      rated_at,
    })),
    { onConflict: "normalized_name" },
  );
  if (error) throw error;
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const model = process.env.LM_STUDIO_MODEL ?? "qwen2.5coder7b:2";

  if (args.uploadOnly) {
    console.log(`[rate:ingredients] upload-only checkpoint=${args.checkpoint}`);
    const n = await withRetry("upload checkpoint", () =>
      flushCheckpointToSupabase(supabase, args.checkpoint),
    );
    console.log(`[rate:ingredients] done uploaded=${n}`);
    return;
  }

  console.log("[rate:ingredients] scanning product lists for unique tokens…");
  let freq: Map<string, number>;
  if (!args.refreshFreqCache) {
    const cached = await loadFreqCache();
    if (cached && cached.size > 0) {
      freq = cached;
      console.log(`[rate:ingredients] using frequency cache (${freq.size} tokens)`);
    } else {
      freq = await withRetry("scan product ingredients", () =>
        collectIngredientFrequencies(supabase),
      );
      await saveFreqCache(freq);
      console.log(`[rate:ingredients] saved frequency cache (${freq.size} tokens)`);
    }
  } else {
    freq = await withRetry("scan product ingredients", () =>
      collectIngredientFrequencies(supabase),
    );
    await saveFreqCache(freq);
  }

  const all = [...freq.keys()];
  const fromCheckpoint = await loadRatedFromCheckpoint(args.checkpoint);
  let fromDb = new Set<string>();
  try {
    fromDb = await withRetry("load rated from db", () => loadRatedFromDb(supabase));
  } catch (e) {
    console.warn(
      `[rate:ingredients] db rated list unavailable (${e instanceof Error ? e.message : e}) — using checkpoint only`,
    );
  }
  const already = new Set([...fromCheckpoint, ...fromDb]);

  let skippedGeneric = 0;
  let skippedBoilerplate = 0;
  let skippedSingleton = 0;
  const pending: string[] = [];

  for (const name of all) {
    if (already.has(name)) continue;
    if (isGenericIngredientCategory(name)) {
      skippedGeneric++;
      continue;
    }
    if (isIngredientBoilerplate(name)) {
      skippedBoilerplate++;
      continue;
    }
    if (args.skipSingletons && (freq.get(name) ?? 0) === 1) {
      skippedSingleton++;
      continue;
    }
    pending.push(name);
  }

  pending.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));

  const toRate = args.limit != null ? pending.slice(0, args.limit) : pending;
  const lmBatches = Math.ceil(toRate.length / args.batchSize);

  console.log(
    `[rate:ingredients] unique=${all.length} already_rated=${already.size} (checkpoint=${fromCheckpoint.size} db=${fromDb.size}) skip_generic=${skippedGeneric} skip_boilerplate=${skippedBoilerplate} skip_singleton=${skippedSingleton} to_rate=${toRate.length} lm_batches≈${lmBatches} batch=${args.batchSize} local=${args.localOnly} checkpoint=${args.checkpoint}`,
  );

  let done = 0;
  const t0 = Date.now();

  for (let i = 0; i < toRate.length; i += args.batchSize) {
    const batch = toRate.slice(i, i + args.batchSize);
    const rows = await rateIngredientsBatchResilient(batch, {
      onSkip: (name, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[rate:ingredients] skip ${name.slice(0, 48)}: ${msg}`);
        logParseDebug(args.debug, `skip "${name.slice(0, 40)}"`, err);
      },
    });

    if (rows.length !== batch.length) {
      console.warn(`[rate:ingredients] parsed ${rows.length}/${batch.length} rows`);
    }

    for (const row of rows) {
      row.normalized_name = normalizeIngredientName(row.normalized_name);
    }

    if (!args.dryRun && rows.length) {
      if (args.localOnly) {
        await appendCheckpointRows(args.checkpoint, rows, model);
      } else if (args.uploadEachBatch) {
        await withRetry("upsert batch", () => upsertBatch(supabase, rows, model));
      }
    }

    done += rows.length;

    if (args.verbose) {
      for (const row of rows) {
        console.log(
          `[rate:ingredients] ${row.normalized_name.slice(0, 40)} nova=${row.nova_class} tier=${row.concern_tier}`,
        );
      }
    }

    if (done % 40 === 0 || i + args.batchSize >= toRate.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const perMin = elapsed > 0 ? ((done / elapsed) * 60).toFixed(0) : "—";
      const localLines = fromCheckpoint.size + done;
      console.log(
        `[rate:ingredients] ${done}/${toRate.length} (${((done / toRate.length) * 100).toFixed(1)}%) ~${perMin}/min local_lines≈${localLines}`,
      );
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[rate:ingredients] lm pass done rated=${done} dry_run=${args.dryRun} elapsed=${elapsed}s`);

  if (!args.dryRun && args.localOnly && !args.skipUpload) {
    console.log("[rate:ingredients] uploading checkpoint to Supabase…");
    try {
      const uploaded = await withRetry("upload checkpoint", () =>
        flushCheckpointToSupabase(supabase, args.checkpoint),
      );
      console.log(`[rate:ingredients] upload complete rows=${uploaded}`);
    } catch (e) {
      console.error(
        `[rate:ingredients] upload failed — ratings are safe in ${args.checkpoint}. Retry: pnpm rate:ingredients -- --upload-only`,
      );
      throw e;
    }
  } else if (args.localOnly && args.skipUpload) {
    console.log(`[rate:ingredients] skip-upload; data in ${args.checkpoint}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
