import { collectZeptoAttributes } from "@/lib/grocery/parse-zepto-detail";
import { buildTextFillContext } from "@/lib/nutrition/gemini-text-fill";

/** Build Gemini CONTEXT from Blinkit attributes or Zepto raw_payload. */
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
