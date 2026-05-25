import seedData from "@/data/fresh-produce.json";
import type { ProductNutrition } from "@/lib/supabase/types";

export type ProduceKind =
  | "fruit"
  | "vegetable"
  | "leafy"
  | "tuber"
  | "gourd"
  | "legume"
  | "herb"
  | "mushroom"
  | "sprout"
  | "pulse";

export interface ProduceEntry {
  id: string;
  kind: ProduceKind;
  aliases: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fiber: number;
  sugar: number;
  fat: number;
  saturated_fat: number;
  sodium: number;
  notes: string;
}

const ENTRIES = (seedData as { entries: ProduceEntry[] }).entries;

/** Aliases sorted longest-first so "raw banana" beats "banana". */
const SORTED_ALIASES: Array<{ alias: string; entry: ProduceEntry }> = ENTRIES.flatMap(
  (entry) => entry.aliases.map((alias) => ({ alias: alias.toLowerCase(), entry })),
).sort((a, b) => b.alias.length - a.alias.length);

const PESTICIDE_NOISE = /\b(ozone\s*wash(ed)?|pesticide\s*cleaned|organically\s*grown|fresh\s*cut|cut\b|peeled|diced|packet|portion|cocktail|combo|imported|pesticide|hydroponic)\b/gi;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(PESTICIDE_NOISE, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchProduce(name: string | null | undefined): ProduceEntry | null {
  if (!name) return null;
  const n = normalize(name);
  if (!n) return null;
  const padded = ` ${n} `;
  for (const { alias, entry } of SORTED_ALIASES) {
    const a = alias.replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
    if (!a) continue;
    // Word-boundary match with optional trailing "s"/"es" plural.
    const re = new RegExp(`(^|\\s)${escapeRe(a)}(es|s)?(\\s|$)`);
    if (re.test(padded)) return entry;
  }
  return null;
}

export function produceToNutrition(entry: ProduceEntry): ProductNutrition {
  return {
    energy_kcal_100g: entry.kcal,
    protein_g_100g: entry.protein,
    carbs_g_100g: entry.carbs,
    fiber_g_100g: entry.fiber,
    sugar_g_100g: entry.sugar,
    added_sugar_g_100g: 0,
    fat_g_100g: entry.fat,
    saturated_fat_g_100g: entry.saturated_fat,
    sodium_mg_100g: entry.sodium,
  };
}

export function produceLabelHint(entry: ProduceEntry): string {
  return `Whole ${entry.kind === "leafy" ? "leafy green" : entry.kind === "herb" ? "fresh herb" : entry.kind === "tuber" ? "root vegetable" : entry.kind}`;
}

export function listProduceIds(): string[] {
  return ENTRIES.map((e) => e.id);
}

export function getProduceById(id: string): ProduceEntry | null {
  return ENTRIES.find((e) => e.id === id) ?? null;
}
