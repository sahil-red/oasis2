import { isCatalogVisible } from "@/lib/products/catalog-eligibility";
import type { ProductListItem } from "@/lib/products/queries";
import { computeDataQuality } from "@/lib/search/v2/data-quality";
import { embedTextBatch } from "@/lib/search/v2/embeddings";
import { computeProductSourceHash } from "@/lib/search/v2/source-hash";
import {
  enrichProductsWithLlm,
  mergeSemanticTraits,
  type LlmProductEnrichment,
} from "@/lib/search/v2/llm-enrichment";
import { assignTiersForType } from "@/lib/search/v2/nutrition-tiers";
import { computeQuantitativeTraits } from "@/lib/search/v2/traits";
import type { ProductSearchIndexRow, TraitVector } from "@/lib/search/v2/types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildSearchDoc(row: {
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category?: string | null;
  primary_type: string | null;
  base_name: string | null;
  flavours: string[];
}): string {
  return [
    row.name,
    row.brand,
    row.base_name,
    row.primary_type,
    row.category,
    row.subcategory,
    row.l3_category,
    ...row.flavours,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export type EnrichSource = Pick<
  ProductListItem,
  | "id"
  | "slug"
  | "name"
  | "brand"
  | "category"
  | "subcategory"
  | "l3_category"
  | "net_weight"
  | "price_inr"
  | "mrp_inr"
  | "nutrition"
  | "ingredients_raw"
  | "attributes"
  | "core_scores"
>;

function baseRowFromProduct(
  p: EnrichSource,
  llm?: LlmProductEnrichment,
): Omit<
  ProductSearchIndexRow,
  "canonical_product_id" | "embedding" | "type_embedding"
> {
  const { data_quality_score, data_completeness, facet_confidence } = computeDataQuality({
    nutrition: p.nutrition,
    ingredients_raw: p.ingredients_raw,
    attributes: p.attributes,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    allergens: llm?.allergens,
  });

  const primary_type = llm?.primary_type?.toLowerCase() ?? null;
  const semantic = llm ? mergeSemanticTraits(llm) : null;

  return {
    product_id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    l3_category: p.l3_category ?? null,
    primary_type,
    base_name: llm?.base_name ?? null,
    form: llm?.form ?? null,
    flavours: llm?.flavours ?? [],
    variants: llm?.variants ?? [],
    is_veg: llm?.is_veg ?? null,
    is_vegan: llm?.is_vegan ?? null,
    is_gluten_free: llm?.is_gluten_free ?? null,
    is_jain: llm?.is_jain ?? null,
    is_palm_oil_free: llm?.is_palm_oil_free ?? null,
    has_added_sugar: llm?.has_added_sugar ?? null,
    allergens: llm?.allergens ?? [],
    claims: llm?.claims ?? [],
    sugar_g: num(p.nutrition?.sugar_g_100g ?? p.nutrition?.added_sugar_g_100g),
    protein_g: num(p.nutrition?.protein_g_100g),
    fat_g: num(p.nutrition?.fat_g_100g),
    saturated_fat_g: num(p.nutrition?.saturated_fat_g_100g),
    sodium_mg: num(p.nutrition?.sodium_mg_100g),
    energy_kcal: num(p.nutrition?.energy_kcal_100g),
    calcium_mg: num(p.nutrition?.calcium_mg_100g),
    fiber_g: num(p.nutrition?.fiber_g_100g),
    price_inr: p.price_inr ?? p.mrp_inr,
    sugar_tier: null,
    protein_tier: null,
    fat_tier: null,
    traits: semantic?.traits ?? {},
    trait_source: semantic?.trait_source ?? {},
    trait_confidence: semantic?.trait_confidence ?? {},
    trait_reasons: semantic?.trait_reasons ?? {},
    scout_score: p.core_scores?.score ?? null,
    nova_group: null,
    data_quality_score,
    data_completeness,
    facet_confidence: { ...facet_confidence, ...(llm?.facet_confidence ?? {}) },
    brand_tier: llm?.brand_tier ?? null,
    pack_size_value: llm?.pack_size_value ?? null,
    pack_size_unit: llm?.pack_size_unit ?? null,
    use_cases: llm?.use_cases ?? [],
    search_doc: buildSearchDoc({
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      l3_category: p.l3_category ?? null,
      primary_type,
      base_name: llm?.base_name ?? null,
      flavours: llm?.flavours ?? [],
    }),
    click_count: 0,
    save_count: 0,
    last_interaction_at: null,
    built_at: new Date().toISOString(),
    source_hash: computeProductSourceHash({
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      l3_category: p.l3_category ?? null,
      nutrition: p.nutrition,
      ingredients_raw: p.ingredients_raw,
      attributes: p.attributes,
    }),
  };
}

function buildCohortMap(
  rows: Array<{
    primary_type: string | null;
    sugar_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
    saturated_fat_g?: number | null;
    sodium_mg: number | null;
    energy_kcal: number | null;
    calcium_mg?: number | null;
    fiber_g?: number | null;
  }>,
) {
  const map = new Map<
    string,
    Array<{
      sugar_g: number | null;
      protein_g: number | null;
      fat_g: number | null;
      saturated_fat_g: number | null;
      sodium_mg: number | null;
      energy_kcal: number | null;
      fiber_g: number | null;
      calcium_mg: number | null;
    }>
  >();
  for (const r of rows) {
    const t = r.primary_type ?? "unknown";
    const list = map.get(t) ?? [];
    list.push({
      sugar_g: r.sugar_g,
      protein_g: r.protein_g,
      fat_g: r.fat_g,
      saturated_fat_g: r.saturated_fat_g ?? null,
      sodium_mg: r.sodium_mg,
      energy_kcal: r.energy_kcal,
      fiber_g: r.fiber_g ?? null,
      calcium_mg: r.calcium_mg ?? null,
    });
    map.set(t, list);
  }
  return map;
}

export function applyQuantitativeTraits(
  rows: ProductSearchIndexRow[],
): ProductSearchIndexRow[] {
  const cohort = buildCohortMap(rows);
  return rows.map((row) => {
    if (!row.primary_type) return row;
    const math = computeQuantitativeTraits({
      nutrition: {
        sugar_g_100g: row.sugar_g ?? undefined,
        added_sugar_g_100g: row.sugar_g ?? undefined,
        protein_g_100g: row.protein_g ?? undefined,
        fat_g_100g: row.fat_g ?? undefined,
        saturated_fat_g_100g: row.saturated_fat_g ?? undefined,
        sodium_mg_100g: row.sodium_mg ?? undefined,
        energy_kcal_100g: row.energy_kcal ?? undefined,
        fiber_g_100g: row.fiber_g ?? undefined,
        calcium_mg_100g: row.calcium_mg ?? undefined,
      },
      has_added_sugar: row.has_added_sugar,
      data_quality_score: row.data_quality_score,
      cohortByType: cohort,
      primary_type: row.primary_type,
    });
    const traits: TraitVector = { ...row.traits, ...math.traits };
    return {
      ...row,
      traits,
      trait_source: { ...row.trait_source, ...math.trait_source },
      trait_confidence: { ...row.trait_confidence, ...math.trait_confidence },
    };
  });
}

export async function finalizeIndexBatch(
  rows: ProductSearchIndexRow[],
): Promise<ProductSearchIndexRow[]> {
  const withTraits = applyQuantitativeTraits(rows);
  const byType = new Map<string, ProductSearchIndexRow[]>();
  for (const row of withTraits) {
    const key = row.primary_type ?? "unknown";
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }

  const staged: Array<{
    row: ProductSearchIndexRow;
    tiers: ReturnType<typeof assignTiersForType>[number];
    docText: string;
    typeText: string;
  }> = [];

  for (const [, group] of byType) {
    const tiers = assignTiersForType(group);
    for (let i = 0; i < group.length; i++) {
      const row = group[i]!;
      staged.push({
        row,
        tiers: tiers[i]!,
        docText: row.search_doc ?? row.name,
        typeText: row.primary_type ?? row.search_doc ?? row.name,
      });
    }
  }

  const [docEmbeds, typeEmbeds] = await Promise.all([
    embedTextBatch(
      staged.map((s) => s.docText),
      64,
      "document",
    ),
    embedTextBatch(
      staged.map((s) => s.typeText),
      64,
      "document",
    ),
  ]);

  const out: ProductSearchIndexRow[] = staged.map((s, i) => {
    const embedding = docEmbeds[i] ?? [];
    const type_embedding = typeEmbeds[i] ?? [];
    return {
      ...s.row,
      sugar_tier: s.tiers.sugar_tier,
      protein_tier: s.tiers.protein_tier,
      fat_tier: s.tiers.fat_tier,
      canonical_product_id: s.row.product_id,
      embedding: embedding.length ? embedding : null,
      type_embedding: type_embedding.length ? type_embedding : null,
    };
  });

  return out;
}

export async function buildIndexFromProducts(
  products: EnrichSource[],
  opts: { llmBatchSize?: number; useLlm?: boolean } = {},
): Promise<ProductSearchIndexRow[]> {
  const eligible = products.filter((p) =>
    isCatalogVisible({
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      ingredients_raw: p.ingredients_raw,
      nutrition: p.nutrition,
    }),
  );

  const useLlm = opts.useLlm !== false && Boolean(process.env.DEEPSEEK_SEARCH_API_KEY || process.env.DEEPSEEK_API_KEY);
  const batchSize = opts.llmBatchSize ?? 20;
  const partial: ProductSearchIndexRow[] = [];

  for (let i = 0; i < eligible.length; i += batchSize) {
    const chunk = eligible.slice(i, i + batchSize);
    let llmMap = new Map<string, LlmProductEnrichment>();
    if (useLlm) {
      llmMap = await enrichProductsWithLlm(
        chunk.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          subcategory: p.subcategory,
          l3_category: p.l3_category ?? null,
          ingredients_raw: p.ingredients_raw,
          attributes: p.attributes,
          nutrition: (p.nutrition ?? null) as Record<string, unknown> | null,
        })),
      );
    }
    for (const p of chunk) {
      const base = baseRowFromProduct(p, llmMap.get(p.id));
      partial.push({
        ...base,
        canonical_product_id: null,
        embedding: null,
        type_embedding: null,
      });
    }
  }

  return finalizeIndexBatch(partial);
}

export { enrichProductsWithLlm };
