import rulesJson from "@/data/ingredient-rules.json";
import type { AdditiveTier } from "@/lib/utils";
import { ADDITIVE_TIER_PENALTY } from "@/lib/utils";

export interface IngredientRule {
  match: string;
  aliases: string[];
  tier: AdditiveTier;
  why: string;
  category?: string;
}

const RULES: IngredientRule[] = (rulesJson as { rules: IngredientRule[] }).rules;

export interface MatchedAdditive {
  name: string;
  tier: AdditiveTier;
  why: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludesNeedle(text: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  if (n.length < 2) return false;
  // Short tokens (MSG, BHA, E211) need word boundaries to avoid false positives.
  if (n.length < 5) {
    return new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(text);
  }
  return text.toLowerCase().includes(n);
}

/** Case-insensitive match against canonical name + aliases. */
export function matchAdditives(ingredientsRaw: string | null): MatchedAdditive[] {
  if (!ingredientsRaw?.trim()) return [];
  const text = ingredientsRaw.toLowerCase();
  const hits: MatchedAdditive[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const needles = [rule.match, ...rule.aliases];
    for (const needle of needles) {
      if (!textIncludesNeedle(text, needle)) continue;
      if (seen.has(rule.match)) break;
      seen.add(rule.match);
      hits.push({ name: rule.match, tier: rule.tier, why: rule.why });
      break;
    }
  }
  return hits;
}

export function scoreAdditives(ingredientsRaw: string | null): {
  score: number;
  matches: MatchedAdditive[];
  hazardous: boolean;
} {
  const matches = matchAdditives(ingredientsRaw);
  let score = 30;
  for (const m of matches) {
    score -= ADDITIVE_TIER_PENALTY[m.tier];
  }
  const hazardous = matches.some((m) => m.tier === "hazardous");
  return { score: Math.max(0, score), matches, hazardous };
}
