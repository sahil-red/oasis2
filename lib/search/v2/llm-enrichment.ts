/**
 * L1 offline LLM enrichment — batched DeepSeek v4-flash (§1, §4, §16.1).
 */
import { deepseekChat, extractJsonObject } from "@/lib/search/deepseek-client";
import type { TraitId, TraitReasonMap, TraitVector } from "@/lib/search/v2/types";
import { TRAIT_IDS } from "@/lib/search/v2/types";

const SEMANTIC_TRAITS: TraitId[] = [
  "hydration",
  "electrolytes",
  "satiety",
  "gut_health",
  "slow_energy",
  "quick_energy",
  "antioxidant",
  "whole_food",
  "clean_label",
  "processing_level",
  "kid_friendly",
  "diabetic_friendly",
  "gym_friendly",
  "elderly_friendly",
];

export type LlmProductEnrichment = {
  primary_type: string;
  base_name: string;
  form: string | null;
  flavours: string[];
  variants: string[];
  is_veg: boolean | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
  is_jain: boolean | null;
  is_palm_oil_free: boolean | null;
  has_added_sugar: boolean | null;
  allergens: string[];
  claims: string[];
  use_cases: string[];
  brand_tier: string | null;
  pack_size_value: number | null;
  pack_size_unit: string | null;
  semantic_traits: Partial<
    Record<TraitId, { value: number; confidence: number; reason: string }>
  >;
  facet_confidence: Record<string, number>;
};

const ENRICHMENT_SYSTEM = `You enrich Indian grocery products for Scout Search. Return JSON:
{"products":[{
  "id": string,
  "primary_type": string,
  "base_name": string,
  "form": string|null,
  "flavours": string[],
  "variants": string[],
  "is_veg": bool|null,
  "is_vegan": bool|null,
  "is_gluten_free": bool|null,
  "is_jain": bool|null,
  "is_palm_oil_free": bool|null,
  "has_added_sugar": bool|null,
  "allergens": string[],
  "claims": string[],
  "use_cases": string[],
  "brand_tier": "national"|"regional"|"local"|null,
  "pack_size_value": number|null,
  "pack_size_unit": string|null,
  "semantic_traits": { "${SEMANTIC_TRAITS[0]}": {"value":0-1,"confidence":0-1,"reason":string}, ... },
  "facet_confidence": { "type":0-1, "flavours":0-1, "dietary":0-1 }
}]}
Use EVERY field provided: name+brand for type/flavour/variants; ingredients for
clean_label/whole_food/palm-oil/allergens/dietary; nutrition for satiety/energy traits;
label.Allergens + "May Contain" for allergens; label."Free From"/Certifications for
dietary flags (vegan/gluten-free/jain) and no-added-sugar; label.Claims for marketing
claims; label.Preparation/Serving/Dosage for use_cases (how it's consumed); net_weight
for pack_size_value+unit.
Extract type and flavours from the product name — never from subcategory alone.
Set dietary booleans true/false ONLY with evidence (ingredients/label); else null.
Semantic traits: reason over the full label+ingredient+nutrition context. null/omit when undeterminable.
Keep each "reason" ≤ 12 words. Omit traits you cannot justify rather than guessing.`;

export type EnrichmentInput = {
  id: string;
  name: string;
  brand: string | null;
  super_category?: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category: string | null;
  net_weight?: string | null;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
  nutrition: Record<string, unknown> | null;
};

/**
 * Curated label fields worth sending the LLM. Excludes noise (Variant ID, Data Source,
 * Customer Care, Manufacturer, DeepSeek confidence flags) that wastes tokens and adds
 * nothing to type/flavour/trait/dietary reasoning.
 */
const USEFUL_ATTR_KEYS = [
  "Label Allergens",
  "Label May Contain",
  "Label Free From",
  "Marketing Claims",
  "Label Chips",
  "Label Certifications",
  "Label Why",
  "Storage Instructions",
  "Preparation Instructions",
  "Serving Suggestion",
  "Recommended Dosage",
];

function curateAttributes(attrs: Record<string, string> | null): Record<string, string> | null {
  if (!attrs) return null;
  const out: Record<string, string> = {};
  for (const key of USEFUL_ATTR_KEYS) {
    const v = attrs[key];
    if (v != null && String(v).trim()) out[key.replace(/^Label /, "")] = String(v);
  }
  return Object.keys(out).length ? out : null;
}

async function enrichBatchOnce(batch: EnrichmentInput[]): Promise<Map<string, LlmProductEnrichment>> {
  const out = new Map<string, LlmProductEnrichment>();
  if (!batch.length) return out;

  const user = JSON.stringify({
    products: batch.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      super_category: p.super_category ?? undefined,
      category: p.category,
      subcategory: p.subcategory,
      l3: p.l3_category,
      net_weight: p.net_weight ?? undefined,
      // Full ingredient list (not truncated to 400) — 16% exceed it, and ingredients
      // are the basis for clean_label / whole_food / palm-oil / allergen reasoning.
      ingredients: p.ingredients_raw?.slice(0, 1500),
      label: curateAttributes(p.attributes),
      nutrition: p.nutrition,
    })),
  });

  const { content } = await deepseekChat({
    usageKind: "search",
    jsonObject: true,
    // 14 semantic traits × {value,confidence,reason} per product needs headroom;
    // too-low a cap truncates JSON for full batches → split-retry churn + data loss.
    maxTokens: 16000,
    timeoutMs: 120_000,
    system: ENRICHMENT_SYSTEM,
    user,
  });

  const parsed = extractJsonObject(content) as {
    products?: Array<LlmProductEnrichment & { id: string }>;
  };

  for (const row of parsed.products ?? []) {
    if (!row.id) continue;
    out.set(row.id, row);
  }
  return out;
}

/** Batched enrichment with automatic split-retry on truncated/malformed JSON. */
export async function enrichProductsWithLlm(
  batch: EnrichmentInput[],
): Promise<Map<string, LlmProductEnrichment>> {
  if (!batch.length) return new Map();

  try {
    return await enrichBatchOnce(batch);
  } catch (err) {
    if (batch.length === 1) {
      console.warn(
        `[llm-enrichment] failed for product ${batch[0]!.id}: ${err instanceof Error ? err.message : err}`,
      );
      return new Map();
    }
    const mid = Math.ceil(batch.length / 2);
    console.warn(
      `[llm-enrichment] batch of ${batch.length} failed, splitting ${mid}+${batch.length - mid}`,
    );
    const [left, right] = await Promise.all([
      enrichProductsWithLlm(batch.slice(0, mid)),
      enrichProductsWithLlm(batch.slice(mid)),
    ]);
    return new Map([...left, ...right]);
  }
}

export function mergeSemanticTraits(
  llm: LlmProductEnrichment,
): {
  traits: TraitVector;
  trait_source: Partial<Record<TraitId, "math" | "llm">>;
  trait_confidence: Partial<Record<TraitId, number>>;
  trait_reasons: TraitReasonMap;
} {
  const traits: TraitVector = {};
  const trait_source: Partial<Record<TraitId, "math" | "llm">> = {};
  const trait_confidence: Partial<Record<TraitId, number>> = {};
  const trait_reasons: TraitReasonMap = {};

  for (const id of TRAIT_IDS) {
    const t = llm.semantic_traits?.[id];
    if (!t || t.value == null) continue;
    traits[id] = Math.max(0, Math.min(1, t.value));
    trait_source[id] = "llm";
    trait_confidence[id] = Math.max(0, Math.min(1, t.confidence));
    if (t.reason) trait_reasons[id] = t.reason;
  }
  return { traits, trait_source, trait_confidence, trait_reasons };
}
