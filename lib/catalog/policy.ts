import blocklist from "@/data/scrape-blocklist.json";
import categoryMap from "@/data/category-canonical-map.json";
import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import type { ProductNutrition } from "@/lib/supabase/types";

export type ScrapeBlocklist = {
  version: number;
  blocked_super_categories: string[];
  blocked_category_patterns: string[];
  blocked_subcategory_patterns: string[];
  combo_name_pattern: string;
};

export type CategoryCanonicalMap = {
  version: number;
  zepto_super_default: Record<string, string>;
  subcategory_aisle_rules: Array<{ pattern: string; aisle: string }>;
  blinkit_aisle_aliases: Record<string, string>;
};

const BL = blocklist as ScrapeBlocklist;
const MAP = categoryMap as CategoryCanonicalMap;

const blockedSupers = new Set(
  BL.blocked_super_categories.map((s) => s.trim().toLowerCase()),
);

function jsRegex(pattern: string): RegExp {
  const inline = pattern.match(/^\(\?([a-z]*)\)/);
  const flags = inline?.[1]?.includes("i") ? "i" : "";
  const body = inline ? pattern.slice(inline[0].length) : pattern;
  return new RegExp(body, flags);
}

const blockedCatRes = BL.blocked_category_patterns.map((p) => jsRegex(p));
const blockedSubRes = BL.blocked_subcategory_patterns.map((p) => jsRegex(p));
const comboRe = jsRegex(BL.combo_name_pattern);

const aisleRules = MAP.subcategory_aisle_rules.map((r) => ({
  re: jsRegex(r.pattern),
  aisle: r.aisle,
}));

export function isComboName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return comboRe.test(name);
}

export function isBlockedTaxonomy(opts: {
  super_category?: string | null;
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
}): boolean {
  const superN = opts.super_category?.trim().toLowerCase() ?? "";
  if (superN && blockedSupers.has(superN)) return true;

  const taxBlob = [opts.category, opts.subcategory, opts.super_category]
    .filter(Boolean)
    .join(" ");
  if (taxBlob && blockedCatRes.some((re) => re.test(taxBlob))) return true;
  const subBlob = [opts.subcategory, opts.category].filter(Boolean).join(" ");
  if (subBlob && blockedSubRes.some((re) => re.test(subBlob))) return true;
  return false;
}

/** Labels for scrape scripts (--skip-categories). */
export function scrapeSkipCategoryNeedles(): string[] {
  return [
    ...BL.blocked_super_categories,
    "fashion",
    "beauty",
    "personal care",
    "household",
    "electronics",
    "pet",
    "stationery",
    "jewell",
    "makeup",
    "shampoo",
    "detergent",
    "cleaning",
    "paan",
    "cigarette",
    "mobile phone",
    "laptop",
  ];
}

export function mapToCanonicalTaxonomy(opts: {
  platform: string;
  super_category: string | null;
  category: string | null;
  subcategory: string | null;
}): { category: string | null; super_category: string | null; subcategory: string | null } {
  const shelf = opts.subcategory?.trim() || null;
  const platform = opts.platform.trim().toLowerCase();

  if (platform === "blinkit") {
    const aisle =
      MAP.blinkit_aisle_aliases[opts.category ?? ""] ??
      opts.category?.trim() ??
      opts.super_category?.trim() ??
      null;
    return {
      category: aisle,
      super_category: aisle,
      subcategory: shelf,
    };
  }

  if (platform === "zepto") {
    const superName = opts.super_category?.trim() ?? "";
    let aisle: string | null = MAP.zepto_super_default[superName] ?? null;
    if (shelf) {
      for (const { re, aisle: a } of aisleRules) {
        if (re.test(shelf)) {
          aisle = a;
          break;
        }
      }
    }
    if (!aisle && opts.category?.trim()) {
      aisle = MAP.zepto_super_default[opts.category.trim()] ?? opts.category.trim();
    }
    return {
      category: aisle,
      super_category: aisle,
      subcategory: shelf,
    };
  }

  return {
    category: opts.category,
    super_category: opts.super_category,
    subcategory: shelf,
  };
}

/** Dedupe key from product title (brand-stripped, pack-size stripped). */
export function normalizeProductKey(name: string, brand: string | null): string {
  let s = name.toLowerCase();
  if (brand?.trim()) {
    const b = brand.trim().toLowerCase();
    if (s.startsWith(b)) s = s.slice(b.length).trim();
  }
  s = s.replace(/\bcombo\b/gi, " ");
  s = s.replace(/\d+\s*x\s*\d+/gi, " ");
  s = s.replace(/\b\d+(\.\d+)?\s*(g|kg|gm|ml|l|ltr|litre|pcs|pc|pack|piece|pieces)\b/gi, " ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

export function productQualityScore(row: {
  platform: string;
  ingredients_raw: string | null;
  nutrition: unknown;
  raw_payload: unknown;
}): number {
  let q = 0;
  if (isPlatformNutritionComplete(row.ingredients_raw, row.nutrition as ProductNutrition | null)) {
    q += 100;
  } else if (row.ingredients_raw?.trim()) q += 30;
  else if (row.nutrition) q += 10;
  if (row.raw_payload) q += 20;
  if (row.platform === "zepto") q += 5;
  return q;
}
