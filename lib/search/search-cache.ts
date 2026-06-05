import type { AiSearchResult } from "@/lib/search/ai-search";
import type { QueryParseResult } from "@/lib/search/query-parse";

const PARSE_TTL_MS = 24 * 60 * 60 * 1000;
const RESULT_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = { at: number; value: T };

const parseCache = new Map<string, CacheEntry<QueryParseResult>>();
const resultCache = new Map<string, CacheEntry<AiSearchResult>>();

const CACHE_VERSION = "v7";

function normalizeKey(prompt: string): string {
  return `${CACHE_VERSION}:${prompt.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function get<T>(map: Map<string, CacheEntry<T>>, key: string, ttlMs: number): T | null {
  const hit = map.get(key);
  if (!hit || Date.now() - hit.at > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function set<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, max = 64) {
  map.set(key, { at: Date.now(), value });
  if (map.size > max) {
    const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) map.delete(oldest);
  }
}

export function getCachedParse(prompt: string): QueryParseResult | null {
  return get(parseCache, normalizeKey(prompt), PARSE_TTL_MS);
}

export function setCachedParse(prompt: string, value: QueryParseResult) {
  set(parseCache, normalizeKey(prompt), value);
}

export function getCachedAiResult(prompt: string, limit: number): AiSearchResult | null {
  return get(resultCache, `${normalizeKey(prompt)}|${limit}`, RESULT_TTL_MS);
}

export function setCachedAiResult(prompt: string, limit: number, value: AiSearchResult) {
  set(resultCache, `${normalizeKey(prompt)}|${limit}`, value);
}
