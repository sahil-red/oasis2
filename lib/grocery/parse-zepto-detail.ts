/**
 * Parse Zepto product-detail API / PDP payload into canonical scrape fields.
 * Zepto prints FSSAI-style ingredients + per-100g nutrition on the PDP — use
 * this before falling back to label OCR.
 */
import { isPlausibleIngredientsList } from "@/lib/nutrition/completeness";
import { mergeNutrition, parseServingNutritionBlock } from "./parse-nutrition-block";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import type { ProductNutrition } from "@/lib/supabase/types";

type ZeptoNode = Record<string, unknown>;

function dig(node: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = node;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function paiseToInr(v: unknown): number | null {
  const n = asNumber(v);
  if (n == null) return null;
  return n > 500 ? n / 100 : n;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

const INGREDIENT_ATTR_RE = /^ingredients?$/i;
const NUTRITION_ATTR_RE = /nutri/i;

/** productInformation / l4Attributes / productDetails → flat attributes map. */
export function collectZeptoAttributes(...nodes: ZeptoNode[]): {
  attributes: Record<string, string>;
  text_blobs: Record<string, string>;
} {
  const attributes: Record<string, string> = {};
  const text_blobs: Record<string, string> = {};

  const ingestRow = (title: string | null, value: string | null) => {
    if (!title || !value) return;
    attributes[title] = value;
    text_blobs[title.toLowerCase().replace(/\s+/g, "_")] = value;
  };

  for (const node of nodes) {
    const lists = [
      node.productInformation,
      node.productDetails,
      node.l4Attributes,
      node.attributes,
      node.details,
    ];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const row of list as ZeptoNode[]) {
        ingestRow(
          asString(row.title) ?? asString(row.key) ?? asString(row.name),
          asString(row.value) ??
            asString(row.subtitle) ??
            asString(row.description) ??
            asString(row.text),
        );
      }
    }
    // Some SKUs expose { key, value } maps.
    const map = node.attributeMap as ZeptoNode | undefined;
    if (map && typeof map === "object") {
      for (const [k, v] of Object.entries(map)) {
        ingestRow(k, asString(v));
      }
    }

    const l4 = node.l4AttributesResponse as ZeptoNode | undefined;
    if (l4 && typeof l4 === "object") {
      for (const listKey of [
        "information",
        "productDetails",
        "productDescription",
        "keyIngredients",
        "highlights",
      ] as const) {
        const list = l4[listKey];
        if (!Array.isArray(list)) continue;
        for (const row of list as ZeptoNode[]) {
          ingestRow(
            asString(row.key) ?? asString(row.title) ?? asString(row.name),
            asString(row.value) ??
              asString(row.subtitle) ??
              asString(row.description) ??
              asString(row.text),
          );
        }
      }
    }
  }

  return { attributes, text_blobs };
}

function ingredientsFromZepto(
  variant: ZeptoNode,
  root: ZeptoNode,
  attributes: Record<string, string>,
): string | null {
  for (const [k, v] of Object.entries(attributes)) {
    if (INGREDIENT_ATTR_RE.test(k) && isPlausibleIngredientsList(v)) return v.trim();
  }

  const direct =
    asString(variant.ingredients) ??
    asString(root.ingredients) ??
    asString(variant.ingredientList) ??
    asString(root.ingredientList);
  if (direct && isPlausibleIngredientsList(direct)) return direct;

  return null;
}

/** Structured macronutrients object on variant (usually per 100g). */
function nutritionFromMacroObject(macro: ZeptoNode): ProductNutrition | null {
  const out: ProductNutrition = { source: "platform" };
  const pairs: Array<[string[], keyof ProductNutrition]> = [
    [["energyKcal", "energy_kcal", "energy", "calories", "kcal"], "energy_kcal_100g"],
    [["proteinG", "protein_g", "protein"], "protein_g_100g"],
    [["fatG", "fat_g", "fat", "totalFat"], "fat_g_100g"],
    [["saturatedFatG", "saturated_fat_g", "saturatedFat"], "saturated_fat_g_100g"],
    [["transFatG", "trans_fat_g", "transFat"], "trans_fat_g_100g"],
    [["carbohydratesG", "carbs_g", "carbohydrates", "carbs", "totalCarbohydrates"], "carbs_g_100g"],
    [["sugarG", "sugar_g", "sugars", "totalSugars"], "sugar_g_100g"],
    [["addedSugarG", "added_sugar_g", "addedSugars"], "added_sugar_g_100g"],
    [["fibreG", "fiberG", "fiber_g", "fibre", "fiber"], "fiber_g_100g"],
    [["sodiumMg", "sodium_mg", "sodium"], "sodium_mg_100g"],
  ];

  let any = false;
  for (const [aliases, outKey] of pairs) {
    for (const alias of aliases) {
      const v = asNumber(macro[alias]);
      if (v != null) {
        (out as Record<string, number>)[outKey] = v;
        any = true;
        break;
      }
    }
  }
  return any ? out : null;
}

/** Title/value rows like "Energy per 100 g (kcal)" → canonical keys. */
function nutritionFromPer100Rows(attributes: Record<string, string>): ProductNutrition | null {
  const canonical: Record<string, number> = {};
  const PER_100 = /per\s*100\s*(?:g|ml)|per\s*serve/i;

  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    if (!PER_100.test(rawKey) && !/^energy|^protein|^fat|^carb|^sugar|^sodium|^fibre|^fiber/i.test(rawKey)) {
      continue;
    }
    const v = asNumber(rawValue);
    if (v == null) continue;
    const k = rawKey.toLowerCase();
    if (/energy|calorie|kcal/.test(k)) canonical.energy_kcal_100g = v;
    else if (/protein/.test(k)) canonical.protein_g_100g = v;
    else if (/saturated fat/.test(k)) canonical.saturated_fat_g_100g = v;
    else if (/trans fat/.test(k)) canonical.trans_fat_g_100g = v;
    else if (/total fat|^fat/.test(k)) canonical.fat_g_100g = v;
    else if (/carb/.test(k)) canonical.carbs_g_100g = v;
    else if (/added sugar/.test(k)) canonical.added_sugar_g_100g = v;
    else if (/sugar/.test(k)) canonical.sugar_g_100g = v;
    else if (/fibre|fiber/.test(k)) canonical.fiber_g_100g = v;
    else if (/sodium/.test(k)) canonical.sodium_mg_100g = v;
  }

  return Object.keys(canonical).length > 0 ? { source: "platform", ...canonical } : null;
}

function nutritionBlockFromAttributes(attributes: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(attributes)) {
    if (NUTRITION_ATTR_RE.test(k) && v.includes("\n")) return v;
  }
  return (
    attributes["Nutritional Information"] ??
    attributes["Nutrition Information"] ??
    attributes["nutrition information"] ??
    null
  );
}

function deepFindMacroObject(node: unknown, depth = 0): ZeptoNode | null {
  if (depth > 6 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = deepFindMacroObject(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const o = node as ZeptoNode;
  if (
    "protein" in o ||
    "proteinG" in o ||
    "protein_g" in o ||
    ("energy" in o && ("fat" in o || "carbohydrates" in o))
  ) {
    return o;
  }
  for (const v of Object.values(o)) {
    const hit = deepFindMacroObject(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function parseZeptoNutritionAndIngredients(opts: {
  variant: ZeptoNode;
  root: ZeptoNode;
  attributes: Record<string, string>;
  name: string;
  category: string | null;
  net_weight: string | null;
}): { ingredients_raw: string | null; nutrition: ProductNutrition | null } {
  const ingredients_raw = ingredientsFromZepto(opts.variant, opts.root, opts.attributes);

  const blockText = nutritionBlockFromAttributes(opts.attributes);
  const fromBlock = blockText ? parseServingNutritionBlock(blockText) : null;
  const fromRows = nutritionFromPer100Rows(opts.attributes);

  const macro =
    nutritionFromMacroObject((opts.variant.macronutrients as ZeptoNode) ?? {}) ??
    nutritionFromMacroObject((opts.root.macronutrients as ZeptoNode) ?? {}) ??
    nutritionFromMacroObject(
      (opts.variant.nutritionInfoPer100g as ZeptoNode) ??
        (opts.root.nutritionInfoPer100g as ZeptoNode) ??
        (opts.variant.nutritionFactsPer100g as ZeptoNode) ??
        {},
    ) ??
    nutritionFromMacroObject(deepFindMacroObject(opts.root) ?? {});

  let merged = mergeNutrition(fromRows, fromBlock);
  merged = mergeNutrition(merged, macro);

  const nutrition = reconcileNutrition({
    nutrition: merged,
    attributes: opts.attributes,
    name: opts.name,
    category: opts.category,
    net_weight: opts.net_weight,
  });

  return { ingredients_raw, nutrition };
}

export function parseZeptoDetailPayload(
  sku: string,
  data: ZeptoNode,
): import("./types").ScrapedProductDetail {
  const WEB_ORIGIN = "https://www.zepto.com";
  const product = (data.product as ZeptoNode | undefined) ?? undefined;
  const storeProducts = (product?.storeProducts as ZeptoNode[] | undefined) ?? [];
  const storeLine =
    storeProducts.find((sp) => asString(dig(sp, "productVariant", "id")) === sku) ??
    storeProducts[0];

  const root =
    (data.productVariant as ZeptoNode) ??
    (storeLine?.productVariant as ZeptoNode) ??
    product ??
    (data.data as ZeptoNode) ??
    data;
  const variant = (root.productVariant as ZeptoNode) ?? root;
  const productRoot = product ?? root;
  const name =
    asString(variant.name) ??
    asString(productRoot.name) ??
    asString(root.name) ??
    "Unknown";
  const brand = asString(variant.brand) ?? asString(productRoot.brand) ?? asString(root.brand);
  const slugPart = asString(variant.slug) ?? asString(productRoot.slug) ?? slugify(name);
  const net_weight =
    asString(variant.packsize) ??
    asString(variant.formattedPacksize) ??
    asString(productRoot.packsize);

  const { attributes, text_blobs } = collectZeptoAttributes(
    variant,
    productRoot,
    storeLine ?? {},
    data,
  );
  const { ingredients_raw, nutrition } = parseZeptoNutritionAndIngredients({
    variant,
    root: productRoot,
    attributes,
    name,
    category: asString(root.primaryCategoryName) ?? asString(productRoot.primaryCategoryName),
    net_weight,
  });

  const image_urls: string[] = [];
  const seen = new Set<string>();
  const pushImg = (u: string | null | undefined) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    image_urls.push(u.startsWith("http") ? u : `https://cdn.zeptonow.com/${u.replace(/^\//, "")}`);
  };

  const imgList =
    (variant.images as ZeptoNode[]) ??
    (root.images as ZeptoNode[]) ??
    (productRoot.images as ZeptoNode[]) ??
    [];
  for (const im of imgList) {
    pushImg(asString(im.path) ?? asString(im.url) ?? asString(im));
  }
  pushImg(asString(variant.imageUrl) ?? asString(root.imageUrl));

  return {
    sku,
    name,
    brand,
    thumb_url: image_urls[0] ?? null,
    price_inr: paiseToInr(variant.sellingPrice ?? root.sellingPrice),
    mrp_inr: paiseToInr(variant.mrp ?? root.mrp),
    net_weight,
    product_url: `${WEB_ORIGIN}/pn/${slugPart}/pvid/${sku}`,
    super_category: asString(root.primaryCategoryName) ?? null,
    category: asString(root.primaryCategoryName) ?? null,
    subcategory: asString(root.subcategoryName) ?? null,
    image_urls,
    barcode: asString(variant.ean) ?? asString(variant.barcode) ?? null,
    ingredients_raw,
    nutrition,
    description: attributes["Description"] ?? attributes["About the Product"] ?? null,
    fssai_license: attributes["FSSAI License"] ?? attributes["License No"] ?? null,
    attributes,
    text_blobs,
    raw_payload: data,
  };
}
