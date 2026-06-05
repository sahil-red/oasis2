/**
 * LLM-backed nutrition plausibility gate.
 *
 * When rule-based anomaly detection would nullify nutrition data, we ask DeepSeek
 * whether the values are actually plausible for this product. This prevents rules
 * from silently discarding real label data and moves us toward LLM/ML validation.
 *
 * Strategy: Rules fire first. If they'd return null, LLM gets a veto. If LLM says
 * "this looks fine", we keep the data. If LLM agrees it's bad, we discard.
 * If LLM is unavailable (timeout, error), we keep data conservatively — better to
 * show slightly suspect data than to silently hide real nutrition.
 */

import { deepseekChat } from "@/lib/search/deepseek-client";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { NutritionContext } from "@/lib/nutrition/anomaly";
import type { NutritionAnomaly } from "@/lib/nutrition/anomaly";

const VALIDATE_SYSTEM = `You assess whether nutrition data on an Indian packaged food label is plausible.
Return exactly one JSON object, no markdown.

Schema: { "plausible": boolean, "confidence": number, "reason": string }

Rules:
- plausible: true if a legitimate Indian food label could reasonably show these values, even if unusual.
- confidence: 0.0-1.0 (how certain you are).
- reason: one short sentence explaining the verdict.
- Be lenient: OCR misreads, rounding differences, and non-standard label formats are common.
- Only mark implausible for truly impossible values (e.g. 200g protein per 100g, -5g fat, 5000 kcal/100g).
- Dense whole foods (nuts, seeds, oils, ghee, nut butters, dark chocolate) can exceed 600 kcal/100g and sum of macros can approach 100g.
- High-protein products like peanut butter, paneer, legumes legitimately have 20-35g protein per 100g.`;

/** In-process cache: product slug → {plausible, at} */
const cache = new Map<string, { plausible: boolean; at: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function isNutritionPlausibleViaLlm(
  nutrition: ProductNutrition,
  ctx: NutritionContext,
  anomalies: NutritionAnomaly[],
  cacheKey?: string,
): Promise<boolean> {
  // Check cache
  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.plausible;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // No key → conservative: keep data, don't discard
    return true;
  }

  const compact = {
    product_name: ctx.name,
    category: ctx.category,
    subcategory: ctx.subcategory ?? null,
    energy_kcal_100g: nutrition.energy_kcal_100g ?? null,
    protein_g_100g: nutrition.protein_g_100g ?? null,
    carbs_g_100g: nutrition.carbs_g_100g ?? null,
    fat_g_100g: nutrition.fat_g_100g ?? null,
    fiber_g_100g: nutrition.fiber_g_100g ?? null,
    sugar_g_100g: nutrition.sugar_g_100g ?? null,
    sodium_mg_100g: nutrition.sodium_mg_100g ?? null,
    flags_triggered: anomalies.map((a) => `${a.code}: ${a.message}`),
  };

  try {
    const { content } = await deepseekChat({
      system: VALIDATE_SYSTEM,
      user: `Assess if this nutrition data is plausible for the product:\n${JSON.stringify(compact, null, 2)}`,
      maxTokens: 120,
      timeoutMs: 8_000,
      jsonObject: true,
    });

    const raw = JSON.parse(content) as {
      plausible?: boolean;
      confidence?: number;
      reason?: string;
    };

    const plausible = raw.plausible !== false; // default to keeping data if unclear
    if (cacheKey) cache.set(cacheKey, { plausible, at: Date.now() });
    return plausible;
  } catch {
    // Any error (timeout, bad JSON, network) → conservative: keep data
    return true;
  }
}

/** Clean up old cache entries periodically */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.at > CACHE_TTL) cache.delete(k);
  }
}, 15 * 60 * 1000);
