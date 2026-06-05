import type { ParsedProductQuery } from "@/lib/search/query-parse";

/** Wrong product types when the user asked for a primary food term. */
export const TERM_FALSE_POSITIVE: Record<string, RegExp[]> = {
  paneer: [
    /\bmasala\b/i,
    /\bmarinade\b/i,
    /\bspice\b/i,
    /\bseasoning\b/i,
    /\bsoda\b/i,
    /\bgoli\b/i,
    /\bpop\b/i,
    /\bbread\b/i,
    /\bpav\b/i,
    /\bbhaji\b/i,
    /\bmix\b/i,
    /\bsorbet\b/i,
    /\bbiscuit\b/i,
    /\bcracker\b/i,
    /\bice cream\b/i,
    /\bsundae\b/i,
    /\bfrozen dessert\b/i,
    /\bparatha\b/i,
    /\broll\b/i,
    /\bkit\b/i,
    /\bready to eat\b/i,
    /\bcurry\b/i,
    /\bgravy\b/i,
    /\bmutter\b/i,
    /\bmomo\b/i,
    /\bbiryani\b/i,
    /\bpops\b/i,
    /\btikka\b/i,
    /\bsnack\b/i,
    /\bfrozen party\b/i,
    /\bnugget\b/i,
    /\bburger\b/i,
    /\bpatty\b/i,
  ],
  ghee: [/\bladdu\b/i, /\bladoo\b/i, /\bbarfi\b/i, /\bmitai\b/i, /\bnamkeen\b/i, /\bbiscuit\b/i],
  milk: [
    /\bmasala\b/i,
    /\bshake\b/i,
    /\bchocolate\b/i,
    /\bcondensed\b/i,
    /\bmilkmaid\b/i,
    /\bcandy\b/i,
    /\bbiscuit\b/i,
    /\bcookie\b/i,
    /\bsoap\b/i,
    /\bface wash\b/i,
    /\bmoistur/i,
  ],
  juice: [
    /\bconcentrate\b/i,
    /\bsquash\b/i,
    /\bcordial\b/i,
    /\bnectar\b/i,
    /\bsoap\b/i,
    /\bshampoo\b/i,
  ],
  biscuits: [/\bmasala\b/i, /\bnoodle\b/i, /\bsoup\b/i, /\bcake mix\b/i],
  biscuit: [/\bmasala\b/i, /\bnoodle\b/i, /\bsoup\b/i, /\bcake mix\b/i],
  cookies: [/\bmasala\b/i, /\bnoodle\b/i],
  cookie: [/\bmasala\b/i, /\bnoodle\b/i],
};

export function isFalsePositiveProductLabel(
  name: string,
  subcategory: string | null | undefined,
  term: string,
): boolean {
  const patterns = TERM_FALSE_POSITIVE[term.toLowerCase()];
  if (!patterns?.length) return false;
  return patterns.some((re) => re.test(name ?? ""));
}

function mergeExcludes(parsed: ParsedProductQuery, words: string[]) {
  parsed.exclude_keywords = [...new Set([...(parsed.exclude_keywords ?? []), ...words])];
}

/** Deterministic parse enrichments for common Indian grocery product types. */
export function applyProductTermHeuristics(parsed: ParsedProductQuery, lower: string): void {
  if (/\bpaneer\b/.test(lower) && !/\bpaneer masala\b|\bbhurji\b/i.test(lower)) {
    parsed.product_terms = ["paneer"];
    parsed.search_keywords = ["paneer", "cottage cheese", "malai paneer", "fresh paneer"];
    mergeExcludes(parsed, [
      "masala",
      "marinade",
      "spice",
      "seasoning",
      "soda",
      "goli",
      "drink",
      "pop",
      "bread",
      "pav",
      "bhaji",
      "mix",
      "biscuit",
      "cracker",
      "nan",
      "paratha",
      "sorbet",
      "ice cream",
      "sundae",
      "frozen dessert",
    ]);
  }

  if (/\bghee\b/.test(lower)) {
    parsed.search_keywords = [
      ...new Set([...parsed.search_keywords, "ghee", "cow ghee", "a2 ghee", "bilona", "desi ghee"]),
    ];
    mergeExcludes(parsed, ["laddu", "ladoo", "barfi", "mithai", "biscuit", "cookie", "namkeen"]);
    if (/grass.?fed|grass fed/.test(lower)) parsed.soft_preferences.push("grass fed");
  }

  if (/\bmilk\b/.test(lower) && !/milkshake|milk chocolate|milkmaid/i.test(lower)) {
    if (!parsed.product_terms.includes("milk")) parsed.product_terms.unshift("milk");
    mergeExcludes(parsed, [
      "masala",
      "shake",
      "chocolate",
      "biscuit",
      "cookie",
      "soap",
      "moistur",
      "face wash",
      "candy",
    ]);
  }

  if (/\bjuice\b|\bjuices\b/.test(lower)) {
    if (!parsed.product_terms.some((t) => t === "juice" || t === "juices")) {
      parsed.product_terms = ["juice", ...parsed.product_terms.filter((t) => t !== "juices")].slice(0, 4);
    }
    mergeExcludes(parsed, ["squash", "cordial", "concentrate", "soap", "shampoo"]);
  }

  if (/\bbiscuits?\b|\bcookies?\b/.test(lower)) {
    const term = /\bcookies?\b/.test(lower) ? "cookies" : "biscuits";
    if (!parsed.product_terms.length) parsed.product_terms = [term];
    mergeExcludes(parsed, ["masala", "noodle", "soup", "cake mix"]);
  }
}
