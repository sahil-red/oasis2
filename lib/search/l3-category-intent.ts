import { productUsecase } from "@/lib/products/catalog-meta";
import type { ProductListItem } from "@/lib/products/queries";
import type { ParsedProductQuery } from "@/lib/search/query-parse";

export type L3IntentRule = {
  /** L3 label must match one of these when present. */
  allow: RegExp[];
  /** Reject when L3 matches any of these. */
  block: RegExp[];
};

/**
 * Zepto L3 / use-case labels → product-type intent (tighter than name alone).
 * Terms without an entry still go through `matchesPrimaryProductType` (name / subcategory / L3).
 */
export const L3_INTENT_BY_TERM: Record<string, L3IntentRule> = {
  paneer: {
    allow: [/paneer/i, /cottage cheese/i, /fresh cheese/i, /malai paneer/i],
    block: [
      /masala/i,
      /spice/i,
      /seasoning/i,
      /ready to eat/i,
      /frozen snack/i,
      /snack/i,
      /momo/i,
      /biryani/i,
      /burger/i,
      /patty/i,
      /tikka masala/i,
      /ice cream/i,
      /dessert/i,
      /sundae/i,
      /biscuit/i,
      /bread/i,
      /paratha/i,
      /pav/i,
      /mix kit/i,
    ],
  },
  milk: {
    allow: [/milk/i, /dairy milk/i, /toned/i, /full cream/i, /skim/i, /cow milk/i, /a2 milk/i],
    block: [/chocolate/i, /shake/i, /flavoured/i, /flavored/i, /soap/i, /face wash/i, /biscuit/i, /cookie/i],
  },
  ghee: {
    allow: [/ghee/i, /clarified butter/i, /bilona/i, /desi ghee/i],
    block: [/laddu/i, /ladoo/i, /mithai/i, /sweet/i, /biscuit/i, /namkeen/i, /snack/i],
  },
  juice: {
    allow: [/juice/i, /fruit beverage/i, /nectar/i],
    block: [/squash/i, /cordial/i, /concentrate/i, /soap/i, /shampoo/i],
  },
  oats: {
    allow: [/oats/i, /oatmeal/i, /muesli/i, /cereal/i],
    block: [/soap/i, /shampoo/i],
  },
  biscuit: {
    allow: [/biscuit/i, /cookie/i, /cracker/i, /rusk/i],
    block: [/masala powder/i, /noodle/i, /soup/i],
  },
  biscuits: {
    allow: [/biscuit/i, /cookie/i, /cracker/i, /rusk/i],
    block: [/masala powder/i, /noodle/i, /soup/i],
  },
  namkeen: {
    allow: [/namkeen/i, /savory snack/i, /chips/i, /bhujia/i, /sev/i],
    block: [/soap/i, /detergent/i],
  },
  buttermilk: {
    allow: [/buttermilk/i, /chaas/i, /chaach/i, /lassi/i, /mattha/i, /curd drink/i, /dairy beverage/i],
    block: [
      /\bdal\b/i,
      /pulse/i,
      /lentil/i,
      /masala/i,
      /spice/i,
      /seasoning/i,
      /\boats\b/i,
      /cereal/i,
      /muesli/i,
      /atta/i,
      /flour/i,
      /besan/i,
      /sattu/i,
      /toor/i,
      /moong/i,
      /urad/i,
      /chana/i,
      /kitchen king/i,
    ],
  },
  chaas: {
    allow: [/buttermilk/i, /chaas/i, /chaach/i, /lassi/i, /mattha/i, /curd drink/i, /dairy beverage/i],
    block: [
      /\bdal\b/i,
      /pulse/i,
      /lentil/i,
      /masala/i,
      /spice/i,
      /seasoning/i,
      /\boats\b/i,
      /cereal/i,
      /muesli/i,
      /atta/i,
      /flour/i,
      /besan/i,
      /sattu/i,
      /toor/i,
      /moong/i,
      /urad/i,
      /chana/i,
      /kitchen king/i,
    ],
  },
  smoothie: {
    allow: [
      /smoothie/i,
      /milkshake/i,
      /shake/i,
      /protein shake/i,
      /yogurt drink/i,
      /probiotic drink/i,
      /oat milk/i,
      /meal replacement/i,
      /lassi/i,
      /health drink/i,
      /fruit drink/i,
      /beverage/i,
      /drink mix/i,
    ],
    block: [/soap/i, /shampoo/i, /detergent/i, /masala/i, /spice/i, /cooking oil/i],
  },
  milkshake: {
    allow: [
      /milkshake/i,
      /shake/i,
      /smoothie/i,
      /protein shake/i,
      /yogurt drink/i,
      /probiotic drink/i,
      /lassi/i,
      /health drink/i,
      /beverage/i,
    ],
    block: [/soap/i, /shampoo/i, /detergent/i, /masala/i, /spice/i],
  },
};

export function l3IntentForProductTerm(term: string): L3IntentRule | null {
  return L3_INTENT_BY_TERM[term.toLowerCase()] ?? null;
}

export function applyL3IntentToParsed(parsed: ParsedProductQuery): void {
  for (const term of parsed.product_terms) {
    const rule = l3IntentForProductTerm(term);
    if (!rule) continue;
    parsed.l3_allow_patterns = [
      ...new Set([...(parsed.l3_allow_patterns ?? []), ...rule.allow.map((r) => r.source)]),
    ];
    parsed.l3_block_patterns = [
      ...new Set([...(parsed.l3_block_patterns ?? []), ...rule.block.map((r) => r.source)]),
    ];
  }
}

function l3Label(p: ProductListItem): string {
  return (productUsecase(p) ?? "").toLowerCase();
}

function nameMatchesProductTerm(p: ProductListItem, term: string, rule: L3IntentRule | null): boolean {
  const name = (p.name ?? "").toLowerCase();
  const tl = term.toLowerCase();
  if (name.includes(tl)) return true;
  if (rule?.allow.some((re) => re.test(name))) return true;
  return false;
}

/** Hard gate: block wrong L3 use-cases for every product that has an L3 label. */
export function passesL3IntentGate(p: ProductListItem, parsed: ParsedProductQuery): boolean {
  const l3 = l3Label(p);
  if (!l3) return true;
  if (!parsed.product_terms.length) return true;

  for (const term of parsed.product_terms) {
    const rule = l3IntentForProductTerm(term);
    if (!rule) continue;
    if (rule.block.some((re) => re.test(l3))) return false;
    if (rule.allow.length > 0 && !rule.allow.some((re) => re.test(l3))) {
      if (!nameMatchesProductTerm(p, term, rule)) return false;
    }
  }

  for (const block of parsed.l3_block_patterns ?? []) {
    try {
      if (new RegExp(block, "i").test(l3)) return false;
    } catch {
      if (l3.includes(block.toLowerCase())) return false;
    }
  }

  if (parsed.l3_allow_patterns?.length) {
    const ok = parsed.l3_allow_patterns.some((pat) => {
      try {
        return new RegExp(pat, "i").test(l3);
      } catch {
        return l3.includes(pat.toLowerCase());
      }
    });
    if (!ok) return false;
  }

  return true;
}

/** Scoring boost when L3 confirms product type. */
export function l3IntentRelevanceBoost(p: ProductListItem, parsed: ParsedProductQuery): number {
  const l3 = l3Label(p);
  if (!l3) return 0;

  let boost = 0;
  for (const term of parsed.product_terms) {
    const rule = l3IntentForProductTerm(term);
    if (!rule) continue;
    if (rule.allow.some((re) => re.test(l3))) boost = Math.max(boost, 78);
    if (rule.block.some((re) => re.test(l3))) return -1000;
  }
  return boost;
}
