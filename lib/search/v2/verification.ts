/**
 * §6 LLM verification net — batched Groq over top results when precision is at risk.
 */
import { groqChat, parseGroqJson } from "@/lib/search/v2/groq-client";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

export const VERIFICATION_CAP = 50;

export function isPrecisionAtRisk(intent: SearchIntentV2): boolean {
  if (intent.required_flavours.length > 0) return true;
  if (intent.modifiers.length > 0) return true;
  if (intent.use_case) return true;
  if (intent.confidence < 0.75) return true;
  const tokens = intent.raw_query.trim().split(/\s+/).filter(Boolean);
  if (intent.kind === "directed" && tokens.length <= 2 && !intent.brand) return true;
  if (
    intent.constraints.avoid_ingredients.length > 0 ||
    intent.constraints.allergens_excluded.length > 0
  ) {
    return true;
  }
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

  if (!process.env.GROQ_API_KEY?.trim()) {
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
    const { content } = await groqChat({
      system: `You verify grocery search results. Return JSON: {"keep_ids": string[]}
Keep only products that are genuinely a ${typeDesc}${flavourDesc}${useCaseDesc} for the shopper query. Text-only judgment. Be strict.`,
      user: JSON.stringify({ query: intent.raw_query, products: payload }),
      maxTokens: 800,
    });
    const parsed = parseGroqJson<{ keep_ids?: string[] }>(content);
    const keep = new Set((parsed.keep_ids ?? []).map(String));
    if (!keep.size) return { rows: [], llm_calls: 1 };

    const verified = slice.filter((r) => keep.has(r.product_id));
    return { rows: verified, llm_calls: 1 };
  } catch {
    return { rows, llm_calls: 0 };
  }
}
