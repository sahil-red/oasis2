/**
 * Semantic intent cache — embed query, cosine ≥ 0.97 reuse (§6).
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

function prefsKey(prefs: AiSearchPreferences | null | undefined): string {
  if (!prefs) return "";
  return JSON.stringify(prefs);
}

export async function getCachedIntent(
  query: string,
  prefs?: AiSearchPreferences | null,
): Promise<SearchIntentV2 | null> {
  const pk = prefsKey(prefs);
  const now = Date.now();
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
  if (!best) return null;
  return { ...best.intent, intent_source: "cache", raw_query: query };
}

export async function setCachedIntent(
  query: string,
  intent: SearchIntentV2,
  prefs?: AiSearchPreferences | null,
): Promise<void> {
  const embedding = await embedText(query, "query");
  if (!embedding.length) return;
  cache.push({
    query,
    prefsKey: prefsKey(prefs),
    embedding,
    intent,
    at: Date.now(),
  });
  while (cache.length > MAX_ENTRIES) cache.shift();
}
