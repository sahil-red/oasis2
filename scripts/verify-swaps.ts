import { findAlternatives } from "@/lib/products/alternatives";
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
