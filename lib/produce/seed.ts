/**
 * Fresh produce matching — delegates to unified reference-seed.
 * Kept for backward compatibility with scripts/seed-fresh-produce.ts.
 */
import {
  getReferenceById,
  listReferenceEntries,
  matchReferenceFood,
  referenceIngredients,
  referenceToNutrition,
  type ReferenceEntry,
  type ReferenceKind,
} from "@/lib/nutrition/reference-seed";
import type { ProductNutrition } from "@/lib/supabase/types";

export type ProduceKind = Extract<
  ReferenceKind,
  | "fruit"
  | "vegetable"
  | "leafy"
  | "tuber"
  | "gourd"
  | "legume"
  | "herb"
  | "mushroom"
  | "sprout"
  | "pulse"
>;

export type ProduceEntry = ReferenceEntry & { kind: ProduceKind };

const PRODUCE_KINDS = new Set<ProduceKind>([
  "fruit",
  "vegetable",
  "leafy",
  "tuber",
  "gourd",
  "legume",
  "herb",
  "mushroom",
  "sprout",
  "pulse",
]);

function isProduceEntry(e: ReferenceEntry): e is ProduceEntry {
  return PRODUCE_KINDS.has(e.kind as ProduceKind);
}

export function matchProduce(name: string | null | undefined): ProduceEntry | null {
  const m = matchReferenceFood(name);
  if (!m || !isProduceEntry(m.entry)) return null;
  return m.entry;
}

export function produceToNutrition(entry: ProduceEntry): ProductNutrition {
  return referenceToNutrition(entry, {
    entry,
    confidence: 0.7,
    match_type: "exact_alias",
    matched_alias: entry.aliases[0],
  });
}

export function produceLabelHint(entry: ProduceEntry): string {
  return referenceIngredients(entry);
}

export function listProduceIds(): string[] {
  return listReferenceEntries()
    .filter(isProduceEntry)
    .map((e) => e.id);
}

export function getProduceById(id: string): ProduceEntry | null {
  const e = getReferenceById(id);
  return e && isProduceEntry(e) ? e : null;
}
