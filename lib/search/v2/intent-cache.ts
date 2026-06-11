/**
 * Intent cache — two-tier lookup for minimal latency:
 *   1. Exact-match string key (zero-cost, instant)
 *   2. Semantic cosine ≥ 0.97 (requires Voyage embedding, ~200ms)
 */
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import type { SearchIntentV2 } from "@/lib/search/v2/types";
import { INTENT_CACHE_THRESHOLD } from "@/lib/search/v2/types";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";

type CacheEntry = {
  query: string;
  prefsKey: string;
  embedding: number[];
  intent: SearchIntentV2;
  at: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache: CacheEntry[] = [];

// Tier 1: instant exact-match map (key = normalised query + prefs)
const exactMap = new Map<string, CacheEntry>();

function prefsKey(prefs: AiSearchPreferences | null | undefined): string {
  if (!prefs) return "";
  return JSON.stringify(prefs, Object.keys(prefs as object).sort());
}

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function exactKey(query: string, pk: string): string {
  return `${pk}\0${normaliseQuery(query)}`;
}

export async function getCachedIntent(
  query: string,
  prefs?: AiSearchPreferences | null,
): Promise<SearchIntentV2 | null> {
  const pk = prefsKey(prefs);
  const now = Date.now();

  // Tier 1: instant exact match — skips Voyage embedding entirely
  const ek = exactKey(query, pk);
  const exact = exactMap.get(ek);
  if (exact && now - exact.at < CACHE_TTL_MS) {
    if (process.env.SEARCH_TELEMETRY) {
      console.log(JSON.stringify({
        type: "intent_cache_telemetry",
        query,
        tier: "exact",
        hit: true,
        best_similarity: 1,
        threshold: INTENT_CACHE_THRESHOLD,
      }));
    }
    return { ...exact.intent, intent_source: "cache", raw_query: query };
  }

  // Tier 2: semantic cosine match — requires Voyage embedding
  const qEmbed = await embedText(query, "query");
  if (!qEmbed.length) return null;

  let best: CacheEntry | null = null;
  let bestSim = 0;
  for (const entry of cache) {
    if (now - entry.at > CACHE_TTL_MS) continue;
    if (entry.prefsKey !== pk) continue;
    const sim = cosineSimilarity(qEmbed, entry.embedding);
    if (sim >= INTENT_CACHE_THRESHOLD && sim > bestSim) {
      best = entry;
      bestSim = sim;
    }
  }
  if (!best) {
    if (process.env.SEARCH_TELEMETRY) {
      console.log(JSON.stringify({
        type: "intent_cache_telemetry",
        query,
        tier: "semantic",
        hit: false,
        best_similarity: bestSim,
        threshold: INTENT_CACHE_THRESHOLD,
      }));
    }
    return null;
  }
  if (process.env.SEARCH_TELEMETRY) {
    console.log(JSON.stringify({
      type: "intent_cache_telemetry",
      query,
      tier: "semantic",
      hit: true,
      best_similarity: bestSim,
      threshold: INTENT_CACHE_THRESHOLD,
    }));
  }
  return { ...best.intent, intent_source: "cache", raw_query: query };
}

export async function setCachedIntent(
  query: string,
  intent: SearchIntentV2,
  prefs?: AiSearchPreferences | null,
): Promise<void> {
  const embedding = await embedText(query, "query");
  if (!embedding.length) return;
  const pk = prefsKey(prefs);
  const entry: CacheEntry = {
    query,
    prefsKey: pk,
    embedding,
    intent,
    at: Date.now(),
  };
  cache.push(entry);
  exactMap.set(exactKey(query, pk), entry);
  while (cache.length > MAX_ENTRIES) {
    const removed = cache.shift()!;
    exactMap.delete(exactKey(removed.query, removed.prefsKey));
  }
}
