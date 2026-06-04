export const FREE_AI_SEARCH_DAILY_LIMIT = 10;

const USAGE_KEY = "scout-ai-search-usage-v1";
const PREFS_KEY = "scout-ai-preferences-v1";

export type AiSearchUsage = {
  day: string;
  count: number;
  limit: number;
};

export type AiSearchPreferences = {
  diet?: string;
  healthContexts?: string[];
  avoidIngredients?: string[];
  budget?: number | null;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultUsage(): AiSearchUsage {
  return { day: todayKey(), count: 0, limit: FREE_AI_SEARCH_DAILY_LIMIT };
}

export function readAiSearchUsage(): AiSearchUsage {
  if (typeof window === "undefined") return defaultUsage();
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    if (!raw) return defaultUsage();
    const parsed = JSON.parse(raw) as Partial<AiSearchUsage>;
    if (parsed.day !== todayKey()) return defaultUsage();
    return {
      day: parsed.day,
      count: typeof parsed.count === "number" ? parsed.count : 0,
      limit: typeof parsed.limit === "number" ? parsed.limit : FREE_AI_SEARCH_DAILY_LIMIT,
    };
  } catch {
    return defaultUsage();
  }
}

export function canUseAiSearch(): boolean {
  const usage = readAiSearchUsage();
  return usage.count < usage.limit;
}

export function recordAiSearch(): AiSearchUsage {
  const usage = readAiSearchUsage();
  const next = { ...usage, count: usage.count + 1 };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function readAiSearchPreferences(): AiSearchPreferences {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) as AiSearchPreferences : {};
  } catch {
    return {};
  }
}

export function writeAiSearchPreferences(prefs: AiSearchPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
