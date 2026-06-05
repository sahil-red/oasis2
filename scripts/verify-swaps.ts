import { findAlternatives, findSimilarProducts } from "@/lib/products/alternatives";
import type { ProductListItem } from "@/lib/products/queries";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function item(partial: Partial<ProductListItem> & Pick<ProductListItem, "id" | "name">): ProductListItem {
  return {
    slug: partial.slug ?? partial.id,
    brand: partial.brand ?? null,
    category: partial.category ?? "Dairy, Bread & Eggs",
    subcategory: partial.subcategory ?? null,
    super_category: null,
    l3_category: null,
    net_weight: null,
    price_inr: partial.price_inr ?? 100,
    mrp_inr: null,
    image_urls: [],
    nutrition: partial.nutrition ?? null,
    core_scores: (partial.core_scores ?? { score: 70, grade: "B", band: "good" }) as ProductListItem["core_scores"],
    attributes: null,
    ...partial,
  } as ProductListItem;
}

const paneer = item({
  id: "1",
  name: "Milky Mist Briyas Tofu Paneer",
  brand: "Milky Mist",
  subcategory: "Paneer & Cream",
  core_scores: { score: 65, grade: "B", band: "good" } as ProductListItem["core_scores"],
});

const pool = [
  item({
    id: "2",
    name: "Pride Of Cows Paneer Pouch",
    subcategory: "Paneer & Cream",
    core_scores: { score: 80, grade: "A", band: "excellent" } as ProductListItem["core_scores"],
  }),
  item({
    id: "3",
    name: "Milky Mist Greek Yogurt",
    brand: "Milky Mist",
    subcategory: "Yogurt & Shrikhand",
    core_scores: { score: 85, grade: "A", band: "excellent" } as ProductListItem["core_scores"],
  }),
];

const swaps = findAlternatives(paneer, pool, "balanced", 3);
assert(
  swaps.every((s) => s.product.subcategory === "Paneer & Cream"),
  `swaps must stay in Paneer & Cream, got ${swaps.map((s) => s.product.name).join(", ")}`,
);

console.log("Swap subcategory checks passed.");

const buttermilk = item({
  id: "b1",
  name: "Mother Dairy Masala Buttermilk",
  brand: "Mother Dairy",
  subcategory: "Buttermilk & Lassi",
  l3_category: "Buttermilk",
});

const buttermilkPool = [
  item({
    id: "b2",
    name: "Go Masala Buttermilk",
    brand: "Go",
    l3_category: "Buttermilk",
    core_scores: { score: 50, grade: "C", band: "average" } as ProductListItem["core_scores"],
  }),
  item({
    id: "b3",
    name: "Phab Pista Power 10g Protein Milkshake",
    brand: "PHAB",
    l3_category: "Protein Milkshake",
    core_scores: { score: 75, grade: "B", band: "good" } as ProductListItem["core_scores"],
  }),
  item({
    id: "b4",
    name: "Mother Dairy Chocolate Milk Shake",
    brand: "Mother Dairy",
    l3_category: "Milkshake",
    core_scores: { score: 40, grade: "D", band: "poor" } as ProductListItem["core_scores"],
  }),
];

const bmSwaps = findAlternatives(buttermilk, buttermilkPool, "balanced", 3);
assert(
  bmSwaps.every((s) => s.product.l3_category === "Buttermilk"),
  `L3 swaps must stay in Buttermilk, got ${bmSwaps.map((s) => s.product.name).join(", ")}`,
);

const bmSimilar = findSimilarProducts(buttermilk, buttermilkPool, "balanced", 4);
assert(
  bmSimilar.every((s) => s.product.l3_category === "Buttermilk"),
  `L3 similar must stay in Buttermilk, got ${bmSimilar.map((s) => s.product.name).join(", ")}`,
);

console.log("Swap L3 use-case checks passed.");
