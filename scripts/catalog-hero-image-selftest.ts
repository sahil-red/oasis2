#!/usr/bin/env -S pnpm tsx
import assert from "node:assert/strict";
import {
  normalizeProductImageUrls,
  orderCatalogImageUrls,
  resolveLabelImageIndex,
} from "@/lib/products/catalog-hero-image";

const a = "https://cdn.zeptonow.com/updt2k6txi/cms/product_variant/aaaa-1111-1111-1111-111111111111.jpeg";
const label = "https://cdn.zeptonow.com/updt2k6txi/cms/product_variant/bbbb-2222-2222-2222-222222222222.jpeg";
const front = "https://cdn.zeptonow.com/updt2k6txi/cms/product_variant/cccc-3333-3333-3333-333333333333.jpeg";

// Label in the middle (typical) — hero should be the frame after the label.
const mid = orderCatalogImageUrls([a, label, front], { ocrImageUrl: label });
assert.equal(mid[0], front);
assert.equal(mid[mid.length - 1], label);

// Label first — hero is first non-label.
const lead = orderCatalogImageUrls([label, front, a], { ocrImageUrl: label });
assert.equal(lead[0], front);

assert.equal(resolveLabelImageIndex([a, label, front], { ocrImageUrl: label }), 1);

assert.deepEqual(
  normalizeProductImageUrls([front, front + "?w=400", a]),
  [front, a],
);

console.log("catalog-hero-image selftest ok");
