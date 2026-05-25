/**
 * Round-robin Gemini OCR across multiple Flash-Lite models, each with its
 * own RPM throttle. On 429/quota errors, tries the next model in the pool.
 *
 * Defaults (free tier):
 *   gemini-3.1-flash-lite — 15 RPM
 *   gemini-2.5-flash-lite — 10 RPM
 *
 * Override with GEMINI_MODELS=model:rpm,model:rpm (comma-separated).
 */

import pThrottle from "p-throttle";
import { geminiOcr, type GeminiOcrOptions } from "./gemini";
import type { OcrPayload } from "./types";

export type GeminiModelSlot = { model: string; rpm: number };

const DEFAULT_POOL: GeminiModelSlot[] = [
  { model: "gemini-3.1-flash-lite", rpm: 15 },
  { model: "gemini-2.5-flash-lite", rpm: 10 },
];

let roundRobin = 0;
const throttledByModel = new Map<
  string,
  (bytes: Buffer, mime: string, opts: GeminiOcrOptions) => Promise<OcrPayload>
>();

export function parseGeminiModelPool(): GeminiModelSlot[] {
  const raw = process.env.GEMINI_MODELS?.trim();
  if (!raw) {
    const legacy = process.env.GEMINI_MODEL?.trim();
    if (legacy && !DEFAULT_POOL.some((s) => s.model === legacy)) {
      const rpm = Number(process.env.GEMINI_RPM ?? 10);
      return [{ model: legacy, rpm: Number.isFinite(rpm) ? rpm : 10 }, ...DEFAULT_POOL];
    }
    return DEFAULT_POOL;
  }
  const slots: GeminiModelSlot[] = [];
  for (const part of raw.split(",")) {
    const [model, rpmStr] = part.trim().split(":");
    if (!model) continue;
    const rpm = Number(rpmStr);
    slots.push({
      model: model.trim(),
      rpm: Number.isFinite(rpm) && rpm > 0 ? rpm : 10,
    });
  }
  return slots.length ? slots : DEFAULT_POOL;
}

function throttledOcrFor(slot: GeminiModelSlot) {
  let fn = throttledByModel.get(slot.model);
  if (!fn) {
    const throttle = pThrottle({
      limit: 1,
      interval: Math.max(200, Math.ceil(60_000 / slot.rpm)),
    });
    fn = throttle(
      async (imageBytes: Buffer, mimeType: string, opts: GeminiOcrOptions) =>
        geminiOcr(imageBytes, mimeType, { ...opts, model: slot.model }),
    );
    throttledByModel.set(slot.model, fn);
  }
  return fn;
}

function isRateLimit(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /429|quota|rate.?limit|resource.?exhausted|too many requests/i.test(msg);
}

/** Models configured for this process (for logging). */
export function geminiPoolSummary(): string {
  return parseGeminiModelPool()
    .map((s) => `${s.model}@${s.rpm}rpm`)
    .join(", ");
}

export async function geminiOcrPooled(
  imageBytes: Buffer,
  mimeType: string = "image/png",
  opts: GeminiOcrOptions = {},
): Promise<OcrPayload> {
  const pool = parseGeminiModelPool();
  const start = roundRobin++ % pool.length;
  let lastErr: unknown;

  for (let i = 0; i < pool.length; i++) {
    const slot = pool[(start + i) % pool.length]!;
    try {
      return await throttledOcrFor(slot)(imageBytes, mimeType, opts);
    } catch (err) {
      lastErr = err;
      if (isRateLimit(err)) {
        console.warn(`[ocr/gemini-pool] ${slot.model} rate-limited; trying next model.`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error("[ocr/gemini-pool] all models exhausted");
}
