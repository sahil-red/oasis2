/**
 * §6 LLM verification net — batched Groq over top ~20 when precision is at risk.
 */
import { groqChat, parseGroqJson } from "@/lib/search/v2/groq-client";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

export const VERIFICATION_CAP = 20;

export function isPrecisionAtRisk(intent: SearchIntentV2): boolean {
  if (intent.required_flavours.length > 0) return true;
  if (intent.modifiers.length > 0) return true;
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

/** Deterministic precision filter when LLM verification is unavailable (§9). */
export function filterCandidatesDeterministic(
  rows: ProductSearchIndexRow[],
  intent: SearchIntentV2,
): ProductSearchIndexRow[] {
  if (!rows.length) return rows;
  const q = intent.raw_query.toLowerCase();
  let out = rows;

  if (/\b(tea|green tea)\b/.test(q) && !/\bmilk\b/.test(q)) {
    const filtered = out.filter((r) => {
      const blob = `${r.name} ${r.primary_type ?? ""}`.toLowerCase();
      return !(/\bmilk\b/.test(blob) && !/\btea\b/.test(blob));
    });
    if (filtered.length) out = filtered;
  }

  if (/\bcoffee\b/.test(q) && !/\bmilk\b/.test(q)) {
    const filtered = out.filter((r) => {
      const blob = `${r.name} ${r.primary_type ?? ""}`.toLowerCase();
      return !(/\bmilk\b/.test(blob) && !/\bcoffee\b/.test(blob));
    });
    if (filtered.length) out = filtered;
  }

  if (/\bpoha\b/.test(q)) {
    const filtered = out.filter((r) => !/\b(milk|paneer)\b/i.test(r.name));
    if (filtered.length) out = filtered;
  }

  if (/\bprotein\s+bar/.test(q) || intent.primary_type?.toLowerCase().includes("bar")) {
    const filtered = out.filter((r) => !/\bjuice\b/i.test(r.name));
    if (filtered.length) out = filtered;
  }

  return out;
}

export async function verifyTopCandidates(
  rows: ProductSearchIndexRow[],
  intent: SearchIntentV2,
): Promise<{ rows: ProductSearchIndexRow[]; llm_calls: number }> {
  const deterministic = filterCandidatesDeterministic(rows, intent);
  if (!isPrecisionAtRisk(intent) || deterministic.length === 0) {
    return { rows: deterministic, llm_calls: 0 };
  }

  if (!process.env.GROQ_API_KEY?.trim()) {
    return { rows: deterministic, llm_calls: 0 };
  }

  const slice = deterministic.slice(0, VERIFICATION_CAP);
  const payload: VerifyRow[] = slice.map((r) => ({
    id: r.product_id,
    name: r.name,
    brand: r.brand,
  }));

  const typeDesc = intent.primary_type ?? "product";
  const flavourDesc =
    intent.required_flavours.length > 0
      ? ` with flavour(s): ${intent.required_flavours.join(", ")}`
      : "";

  try {
    const { content } = await groqChat({
      system: `You verify grocery search results. Return JSON: {"keep_ids": string[]}
Keep only products that are genuinely a ${typeDesc}${flavourDesc}. Text-only judgment. Be strict.`,
      user: JSON.stringify({ query: intent.raw_query, products: payload }),
      maxTokens: 600,
    });
    const parsed = parseGroqJson<{ keep_ids?: string[] }>(content);
    const keep = new Set((parsed.keep_ids ?? []).map(String));
    if (!keep.size) return { rows: deterministic, llm_calls: 1 };

    const verifiedHead = slice.filter((r) => keep.has(r.product_id));
    const tail = deterministic.slice(VERIFICATION_CAP);
    const merged = [...verifiedHead, ...tail.filter((r) => keep.has(r.product_id))];
    return { rows: merged.length ? merged : deterministic, llm_calls: 1 };
  } catch {
    return { rows: deterministic, llm_calls: 0 };
  }
}
