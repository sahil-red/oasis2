/**
 * §10 Popularity — time-decayed CTR, cold-start boost, exploration slot.
 */
import { createHash } from "node:crypto";
import type { ProductSearchIndexRow, RankedCandidate } from "@/lib/search/v2/types";

export const POPULARITY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
export const COLD_START_DAYS = 14;
export const EXPLORATION_RATE = 0.05;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Exponential decay — 30-day half-life (§10). */
export function timeDecayFactor(lastInteractionAt: string | null): number {
  if (!lastInteractionAt) return 0.35;
  const ageMs = Date.now() - new Date(lastInteractionAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1;
  return Math.pow(0.5, ageMs / POPULARITY_HALF_LIFE_MS);
}

/** First 14 days: popularity weight ramps from ~0 (§10 cold start). */
export function coldStartPopularityMultiplier(builtAt: string | null): number {
  if (!builtAt) return 1;
  const ageDays = (Date.now() - new Date(builtAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays >= COLD_START_DAYS) return 1;
  return clamp01(ageDays / COLD_START_DAYS);
}

/** Raw popularity signal before candidate-set normalization. */
export function computePopularitySignal(row: ProductSearchIndexRow): number {
  const decay = timeDecayFactor(row.last_interaction_at);
  const cold = coldStartPopularityMultiplier(row.built_at);
  const clicks = (row.click_count ?? 0) * decay;
  const saves = (row.save_count ?? 0) * decay;
  return clamp01((Math.log1p(clicks * 0.5 + saves * 0.8) / 5) * cold);
}

/** ~5% of queries: promote one mid-ranked candidate for exploration (§10). */
export function applyExplorationSlot(
  ranked: RankedCandidate[],
  query: string,
  limit: number,
): { items: RankedCandidate[]; explored: boolean } {
  const baseline = ranked.slice(0, limit);
  if (ranked.length <= limit) return { items: baseline, explored: false };

  const hash = createHash("sha256").update(query).digest();
  const roll = hash[0]! / 255;
  if (roll >= EXPLORATION_RATE) return { items: baseline, explored: false };

  const poolStart = Math.min(limit, ranked.length - 1);
  const poolEnd = Math.min(ranked.length, limit + 20);
  const pool = ranked.slice(poolStart, poolEnd);
  if (!pool.length) return { items: baseline, explored: false };

  const pickIdx = hash[1]! % pool.length;
  const promoted = pool[pickIdx]!;
  const head = ranked.slice(0, limit - 1);
  const seen = new Set(head.map((c) => c.row.product_id));
  if (seen.has(promoted.row.product_id)) return { items: baseline, explored: false };

  return { items: [...head, promoted], explored: true };
}
