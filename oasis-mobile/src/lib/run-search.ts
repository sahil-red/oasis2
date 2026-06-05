import { fetchAiSearch } from "@/lib/api";
import { canUseAiSearch, readAiSearchPreferences, recordAiSearch } from "@/lib/ai-usage";
import { classifyIntent } from "@/lib/search-intent";
import type { AiSearchResult, CatalogMeta } from "@/types/api";

const CATALOG_PAGE_SIZE = 24;

/**
 * Same routing as web `catalog-view` `runAiSearch`:
 * always POST `/api/search/ai` with structured vs complex tier (never lexical catalog).
 */
export async function runCatalogSearch(
  query: string,
  token: string | null,
  catalogMeta: CatalogMeta | null,
  limit = CATALOG_PAGE_SIZE,
): Promise<AiSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error("Enter at least 2 characters to search.");
  }

  const intent = classifyIntent(trimmed, {
    brands: catalogMeta?.filters.brands,
    subcategories: catalogMeta?.filters.subcategories,
  });

  if (!(await canUseAiSearch())) {
    const err = new Error(
      "Free AI searches used for today. Upgrade to Scout Plus for unlimited searches.",
    ) as Error & { code?: string };
    err.code = "quota_exceeded";
    throw err;
  }

  const preferences = await readAiSearchPreferences();
  const tier = intent === "complex" ? "complex" : "structured";

  const result = await fetchAiSearch(trimmed, token, limit, tier, preferences);
  await recordAiSearch();
  return result;
}
