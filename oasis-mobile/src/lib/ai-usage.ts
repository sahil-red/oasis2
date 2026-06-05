import AsyncStorage from "@react-native-async-storage/async-storage";

/** Mirrors web `lib/search/ai-usage.ts` keys so prefs sync if users use both. */
export const FREE_AI_SEARCH_DAILY_LIMIT = 999;

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

export async function readAiSearchUsage(): Promise<AiSearchUsage> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    if (!raw) return defaultUsage();
    const parsed = JSON.parse(raw) as Partial<AiSearchUsage>;
    if (parsed.day !== todayKey()) return defaultUsage();
    return {
      day: parsed.day!,
      count: typeof parsed.count === "number" ? parsed.count : 0,
      limit: typeof parsed.limit === "number" ? parsed.limit : FREE_AI_SEARCH_DAILY_LIMIT,
    };
  } catch {
    return defaultUsage();
  }
}

export async function canUseAiSearch(): Promise<boolean> {
  const usage = await readAiSearchUsage();
  return usage.count < usage.limit;
}

export async function recordAiSearch(): Promise<AiSearchUsage> {
  const usage = await readAiSearchUsage();
  const next = { ...usage, count: usage.count + 1 };
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(next));
  return next;
}

export async function readAiSearchPreferences(): Promise<AiSearchPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as AiSearchPreferences) : {};
  } catch {
    return {};
  }
}
