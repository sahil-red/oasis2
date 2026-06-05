#!/usr/bin/env -S pnpm tsx
import assert from "node:assert/strict";
import {
  needsHeroReorder,
  normalizeProductImageUrls,
  orderCatalogImageUrls,
} from "@/lib/products/catalog-hero-image";

const front = "https://cdn.zeptonow.com/assets/front/packshot-1.jpg";
const back = "https://cdn.zeptonow.com/assets/nutrition-facts/back-label.jpg";
const side = "https://cdn.zeptonow.com/assets/misc/side-2.jpg";

assert.equal(orderCatalogImageUrls([back, front, side])[0], front);
assert.equal(needsHeroReorder([back, front, side]), true);
assert.equal(needsHeroReorder([front, side, back]), false);

const withOcr = normalizeProductImageUrls([back, front], { ocrImageUrl: back });
assert.equal(withOcr[0], front);

assert.deepEqual(
  normalizeProductImageUrls([
    front,
    front + "?w=400",
    side,
  ]),
  [front, side],
);

console.log("catalog-hero-image selftest ok");
