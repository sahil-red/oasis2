import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

export const DEFAULT_INGREDIENT_CHECKPOINT = resolve(
  "data/cache/rate-ingredients/results.jsonl",
);

export type CheckpointRecord = IngredientIntelligenceRow & {
  model: string;
  rated_at: string;
};

export async function ensureCheckpointDir(checkpointPath: string): Promise<void> {
  await mkdir(dirname(checkpointPath), { recursive: true });
}

export async function loadRatedFromCheckpoint(
  checkpointPath: string,
): Promise<Set<string>> {
  const rated = new Set<string>();
  let text: string;
  try {
    text = await readFile(checkpointPath, "utf8");
  } catch {
    return rated;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as { normalized_name?: string };
      if (row.normalized_name) rated.add(row.normalized_name);
    } catch {
      /* skip corrupt line */
    }
  }
  return rated;
}

export async function appendCheckpointRows(
  checkpointPath: string,
  rows: IngredientIntelligenceRow[],
  model: string,
): Promise<void> {
  if (!rows.length) return;
  await ensureCheckpointDir(checkpointPath);
  const rated_at = new Date().toISOString();
  const lines = rows.map((row) =>
    JSON.stringify({ ...row, model, rated_at } satisfies CheckpointRecord),
  );
  await appendFile(checkpointPath, `${lines.join("\n")}\n`, "utf8");
}

export async function readCheckpointRecords(
  checkpointPath: string,
): Promise<CheckpointRecord[]> {
  let text: string;
  try {
    text = await readFile(checkpointPath, "utf8");
  } catch {
    return [];
  }
  const byName = new Map<string, CheckpointRecord>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as CheckpointRecord;
      if (row.normalized_name) byName.set(row.normalized_name, row);
    } catch {
      /* skip */
    }
  }
  return [...byName.values()];
}

export async function flushCheckpointToSupabase(
  supabase: SupabaseClient,
  checkpointPath: string,
  opts?: { chunkSize?: number; log?: (msg: string) => void },
): Promise<number> {
  const log = opts?.log ?? console.log;
  const chunkSize = opts?.chunkSize ?? 150;
  const records = await readCheckpointRecords(checkpointPath);
  if (!records.length) {
    log("[rate:ingredients] checkpoint empty — nothing to upload");
    return 0;
  }

  let uploaded = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from("ingredient_intelligence").upsert(
      chunk.map((row) => ({
        normalized_name: row.normalized_name,
        display_name: row.display_name,
        nova_class: row.nova_class,
        role: row.role,
        concern_tier: row.concern_tier,
        concern_reasons: row.concern_reasons,
        intrinsic_quality: row.intrinsic_quality,
        synonyms: row.synonyms,
        model: row.model,
        rated_at: row.rated_at,
      })),
      { onConflict: "normalized_name" },
    );
    if (error) throw error;
    uploaded += chunk.length;
    log(
      `[rate:ingredients] uploaded ${uploaded}/${records.length} → ingredient_intelligence`,
    );
  }
  return uploaded;
}
