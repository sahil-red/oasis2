import { isCatalogVisible } from "@/lib/products/catalog-eligibility";
import type { ProductListItem } from "@/lib/products/queries";
import { computeDataQuality } from "@/lib/search/v2/data-quality";
import { assignTiersForType } from "@/lib/search/v2/nutrition-tiers";
import {
  computeDerivedTraits,
  extractFlavoursFromName,
  inferPrimaryType,
} from "@/lib/search/v2/traits";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseAllergens(attrs: Record<string, string> | null | undefined): string[] {
  const raw =
    attrs?.["Label Allergens"] ??
    attrs?.["Allergen Information"] ??
    attrs?.["Allergens"] ??
    "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,;|/]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);
}

function parseClaims(attrs: Record<string, string> | null | undefined): string[] {
  const raw = attrs?.["Marketing Claims"] ?? attrs?.["Claims"] ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);
}

function parseDietFlags(attrs: Record<string, string> | null | undefined, ingredients: string) {
  const diet = (attrs?.["Diet Preference"] ?? "").toLowerCase();
  const hay = `${diet} ${ingredients}`.toLowerCase();
  const is_veg = /\bveg\b|vegetarian/.test(diet) && !/\bnon[\s-]?veg/.test(diet) ? true : null;
  const is_vegan = /\bvegan\b/.test(diet) || /\bvegan\b/.test(hay) ? true : null;
  const is_gluten_free = /\bgluten[\s-]?free\b/.test(diet) || /\bgluten[\s-]?free\b/.test(hay);
  const is_jain = /\bjain\b/.test(diet) || /\bjain\b/.test(hay);
  const is_palm_oil_free =
    /\bno palm\b|\bpalm[\s-]?free\b/.test(hay) ||
    /\bno palm\b/.test((attrs?.["Marketing Claims"] ?? "").toLowerCase());
  return {
    is_veg: is_veg ?? null,
    is_vegan: is_vegan ?? null,
    is_gluten_free: is_gluten_free || null,
    is_jain: is_jain || null,
    is_palm_oil_free: is_palm_oil_free || null,
  };
}

function inferHasAddedSugar(
  nutrition: ProductListItem["nutrition"],
  claims: string[],
  name: string,
): boolean | null {
  const added = num(nutrition?.added_sugar_g_100g);
  if (added != null) return added > 0.5;
  if (claims.some((c) => /no added sugar|unsweetened|zero sugar/.test(c))) return false;
  if (/\b(no added sugar|unsweetened|sugar free|zero sugar)\b/i.test(name)) return false;
  const sugar = num(nutrition?.sugar_g_100g);
  if (sugar != null && sugar <= 1) return false;
  return null;
}

function inferBrandTier(brand: string | null): string | null {
  if (!brand?.trim()) return null;
  const b = brand.toLowerCase();
  const national = [
    "amul",
    "nestle",
    "britannia",
    "parle",
    "haldiram",
    "itc",
    "dabur",
    "patanjali",
    "mother dairy",
    "cadbury",
    "pepsico",
    "coca",
    "pepsi",
    "tata",
  ];
  if (national.some((n) => b.includes(n))) return "national";
  if (b.length <= 12) return "regional";
  return "local";
}

function parsePackSize(netWeight: string | null): { value: number | null; unit: string | null } {
  if (!netWeight?.trim()) return { value: null, unit: null };
  const m = netWeight.match(/(\d+(?:\.\d+)?)\s*(g|gm|gram|kg|ml|l|ltr|litre|liter)/i);
  if (!m) return { value: null, unit: null };
  let value = Number(m[1]);
  let unit = m[2]!.toLowerCase();
  if (unit === "gm" || unit === "gram") unit = "g";
  if (unit === "ltr" || unit === "litre" || unit === "liter") unit = "l";
  if (unit === "kg") {
    value *= 1000;
    unit = "g";
  }
  if (unit === "l") {
    value *= 1000;
    unit = "ml";
  }
  return { value: Number.isFinite(value) ? value : null, unit };
}

function buildSearchDoc(row: {
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category: string | null;
  primary_type: string;
  flavours: string[];
  ingredients_raw: string | null;
}): string {
  return [
    row.name,
    row.brand,
    row.category,
    row.subcategory,
    row.l3_category,
    row.primary_type,
    ...row.flavours,
    row.ingredients_raw?.slice(0, 200),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function canonicalClusterKey(brand: string | null, name: string, primaryType: string): string {
  const base = name
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(g|gm|kg|ml|l|pack|pcs)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${(brand ?? "").toLowerCase()}|${primaryType}|${base}`;
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

/** Build a partial index row (tiers assigned later per primary_type batch). */
export function enrichProductToIndexRow(p: EnrichSource): ProductSearchIndexRow {
  const { primary_type, type_aliases } = inferPrimaryType({
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    l3_category: p.l3_category,
  });
  const flavours = extractFlavoursFromName(p.name);
  const allergens = parseAllergens(p.attributes);
  const claims = parseClaims(p.attributes);
  const ingredients = (p.ingredients_raw ?? "").toLowerCase();
  const diet = parseDietFlags(p.attributes, ingredients);
  const has_added_sugar = inferHasAddedSugar(p.nutrition, claims, p.name);
  const { data_quality_score, data_completeness, facet_confidence } = computeDataQuality({
    nutrition: p.nutrition,
    ingredients_raw: p.ingredients_raw,
    attributes: p.attributes,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
  });

  const scout_score = p.core_scores?.score ?? null;
  const nova_group: number | null = null;

  const traitPack = computeDerivedTraits({
    nutrition: p.nutrition,
    ingredients_raw: p.ingredients_raw,
    scout_score,
    nova_group,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    has_added_sugar,
    data_quality_score,
  });

  const pack = parsePackSize(p.net_weight ?? null);
  const n = p.nutrition;

  return {
    product_id: p.id,
    canonical_product_id: null,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    l3_category: p.l3_category ?? null,
    primary_type,
    type_aliases,
    form: null,
    flavours,
    variants: [],
    is_veg: diet.is_veg,
    is_vegan: diet.is_vegan,
    is_gluten_free: diet.is_gluten_free,
    is_jain: diet.is_jain,
    is_palm_oil_free: diet.is_palm_oil_free,
    has_added_sugar,
    allergens,
    claims,
    sugar_g: num(n?.sugar_g_100g ?? n?.added_sugar_g_100g),
    protein_g: num(n?.protein_g_100g),
    fat_g: num(n?.fat_g_100g),
    sodium_mg: num(n?.sodium_mg_100g),
    energy_kcal: num(n?.energy_kcal_100g),
    price_inr: p.price_inr ?? p.mrp_inr,
    sugar_tier: null,
    protein_tier: null,
    fat_tier: null,
    traits: traitPack.traits,
    trait_source: traitPack.trait_source,
    trait_confidence: traitPack.trait_confidence,
    scout_score,
    nova_group,
    data_quality_score,
    data_completeness,
    facet_confidence,
    brand_tier: inferBrandTier(p.brand),
    pack_size_value: pack.value,
    pack_size_unit: pack.unit,
    use_cases: p.l3_category ? [p.l3_category.toLowerCase()] : [],
    search_doc: buildSearchDoc({
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      l3_category: p.l3_category ?? null,
      primary_type,
      flavours,
      ingredients_raw: p.ingredients_raw,
    }),
    search_count: 0,
    click_count: 0,
    save_count: 0,
  };
}

/** Assign per-type nutrition tiers and canonical cluster ids across a batch. */
export function finalizeIndexBatch(rows: ProductSearchIndexRow[]): ProductSearchIndexRow[] {
  const byType = new Map<string, ProductSearchIndexRow[]>();
  for (const row of rows) {
    const key = row.primary_type ?? "food";
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }

  const out: ProductSearchIndexRow[] = [];
  const clusterRep = new Map<string, string>();

  for (const [, group] of byType) {
    const tiers = assignTiersForType(group);
    group.forEach((row, i) => {
      const t = tiers[i]!;
      const clusterKey = canonicalClusterKey(row.brand, row.name, row.primary_type ?? "food");
      let canonicalId = clusterRep.get(clusterKey);
      if (!canonicalId) {
        canonicalId = row.product_id;
        clusterRep.set(clusterKey, canonicalId);
      }
      out.push({
        ...row,
        sugar_tier: t.sugar_tier,
        protein_tier: t.protein_tier,
        fat_tier: t.fat_tier,
        canonical_product_id: canonicalId,
      });
    });
  }
  return out;
}

export function buildIndexFromProducts(products: EnrichSource[]): ProductSearchIndexRow[] {
  const eligible = products.filter((p) =>
    isCatalogVisible({
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      ingredients_raw: p.ingredients_raw,
      nutrition: p.nutrition,
    }),
  );
  const partial = eligible.map(enrichProductToIndexRow);
  return finalizeIndexBatch(partial);
}
