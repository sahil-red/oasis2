import { collectZeptoAttributes } from "@/lib/grocery/parse-zepto-detail";

const CONTEXT_KEYS = [
  "Description",
  "About the Product",
  "Ingredients",
  "Nutritional Information",
  "Key Features",
  "Allergen Information",
  "Diet Preference",
  "Country of Origin",
  "Net Quantity",
  "Shelf Life",
  "Storage",
  "Disclaimer",
  "Manufacturer",
  "Seller",
  "Brand",
  "Type",
  "Flavour",
  "Pack Size",
];

/** Build a plain-text context block from platform attributes (no LLM). */
export function buildTextFillContext(attrs: Record<string, string>): string {
  const lines: string[] = [];
  for (const key of CONTEXT_KEYS) {
    const val = attrs[key]?.trim();
    if (val) lines.push(`${key}:\n${val}`);
  }
  for (const [key, val] of Object.entries(attrs)) {
    if (CONTEXT_KEYS.includes(key)) continue;
    const v = val?.trim();
    if (v && v.length > 2) lines.push(`${key}:\n${v}`);
  }
  return lines.join("\n\n");
}

/** Build context from Blinkit attributes or Zepto raw_payload. */
export function buildProductFillContext(
  attrs: Record<string, string> | null,
  raw_payload: Record<string, unknown> | null,
  platform: string,
): string {
  const blinkit = (attrs ?? {}) as Record<string, string>;
  if (Object.keys(blinkit).length > 0) {
    const ctx = buildTextFillContext(blinkit);
    if (ctx.trim()) return ctx;
  }

  if (platform === "zepto" && raw_payload && typeof raw_payload === "object") {
    const data = raw_payload as Record<string, unknown>;
    const product = (data.product as Record<string, unknown>) ?? data;
    const storeProducts = (product.storeProducts as Record<string, unknown>[]) ?? [];
    const storeLine = storeProducts[0] ?? {};
    const variant =
      (product.productVariant as Record<string, unknown>) ??
      (storeLine.productVariant as Record<string, unknown>) ??
      product;
    const { attributes } = collectZeptoAttributes(variant, product, storeLine, data);
    const zeptoCtx = buildTextFillContext(attributes);
    if (zeptoCtx.trim()) return zeptoCtx;
    const desc = attributes["Description"] ?? attributes["About the Product"];
    if (desc) return `Description:\n${desc}`;
  }

  return "";
}
