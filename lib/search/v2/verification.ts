/**
 * §6 LLM verification net — batched DeepSeek over top results when precision is at risk.
 */
import { deepseekChat, extractJsonObject } from "@/lib/search/deepseek-client";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

export const VERIFICATION_CAP = 50;

export function isPrecisionAtRisk(intent: SearchIntentV2): boolean {
  // Only verify when there's genuine mismatch/safety risk — a required flavour/variant
  // (the chocolate-bar-vs-milk case) or an avoid/allergen constraint. The deterministic
  // type-gate already handles plain type queries, so verifying every short query just
  // adds a ~2.5s DeepSeek call for no precision gain.
  if (intent.required_flavours.length > 0) return true;
  if (intent.constraints.avoid_ingredients.length > 0) return true;
  if (intent.constraints.allergens_excluded.length > 0) return true;
  if (intent.confidence < 0.5) return true;
  return false;
}

type VerifyRow = { id: string; name: string; brand: string | null };

export async function verifyTopCandidates(
  rows: ProductSearchIndexRow[],
  intent: SearchIntentV2,
): Promise<{ rows: ProductSearchIndexRow[]; llm_calls: number }> {
  if (!isPrecisionAtRisk(intent) || rows.length === 0) {
    return { rows, llm_calls: 0 };
  }

  if (!(process.env.DEEPSEEK_SEARCH_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim()) {
    return { rows, llm_calls: 0 };
  }

  const slice = rows.slice(0, VERIFICATION_CAP);
  const payload: VerifyRow[] = slice.map((r) => ({
    id: r.product_id,
    name: r.name,
    brand: r.brand,
  }));

  const typeDesc = intent.primary_type ?? intent.use_case?.replace(/_/g, " ") ?? "product";
  const flavourDesc =
    intent.required_flavours.length > 0
      ? ` with flavour(s): ${intent.required_flavours.join(", ")}`
      : "";
  const useCaseDesc = intent.use_case
    ? ` suitable for ${intent.use_case.replace(/_/g, " ")}`
    : "";

  try {
    const { content } = await deepseekChat({
      usageKind: "search",
      jsonObject: true,
      maxTokens: 800,
      timeoutMs: 20_000,
      system: `You verify grocery search results. Return JSON: {"keep_ids": string[]}
KEEP every product whose core form/category plausibly IS a ${typeDesc}${flavourDesc}${useCaseDesc}
— e.g. "Tender Coconut Water" and "Coconut Water Concentrate" are both coconut water; keep them.
ONLY EXCLUDE products that are a clearly DIFFERENT form despite shared words: a chocolate BAR is
not chocolate MILK; a biscuit is not a juice. When the type plausibly matches, KEEP it (favour
recall); reject only obvious category mismatches.`,
      user: JSON.stringify({ query: intent.raw_query, products: payload }),
    });
    const parsed = extractJsonObject(content) as { keep_ids?: string[] };
    const keep = new Set((parsed.keep_ids ?? []).map(String));
    if (!keep.size) return { rows: [], llm_calls: 1 };

    const verified = slice.filter((r) => keep.has(r.product_id));
    return { rows: verified, llm_calls: 1 };
  } catch {
    return { rows, llm_calls: 0 };
  }
}
