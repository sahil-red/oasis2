/**
 * OCR orchestrator — Tesseract only (local label read from product images).
 *
 * `ocrProductImages(urls)` → `OcrPayload`
 *   1. Pick back-label candidate URLs (last carousel images first).
 *   2. Download → cache → preprocess → Tesseract → regex → OcrPayload.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./hash";
import { preprocessForOcr } from "./preprocess";
import { pickBackLabelCandidates } from "./picker";
import { tesseractOcr } from "./tesseract";
import { readCache, writeCache } from "./cache";
import type { OcrPayload } from "./types";

export type OcrBackend = "tesseract" | "gemini" | "auto";

/** Legacy — Tesseract-only path never throws this; kept for CLI compatibility. */
export class RemoteBudgetExhausted extends Error {
  constructor(message = "Remote OCR budget exhausted") {
    super(message);
    this.name = "RemoteBudgetExhausted";
  }
}

export interface OcrOrchestratorOptions {
  /** Ignored — kept for CLI compatibility. OCR is always Tesseract. */
  backend?: OcrBackend;
  bypassCache?: boolean;
}

export interface OcrResult {
  payload: OcrPayload;
  imageUrl: string;
  imageSha256: string;
  fromCache: boolean;
  attempts: Array<{ url: string; reason: string }>;
}

export class OcrOrchestrator {
  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly opts: OcrOrchestratorOptions = {},
  ) {}

  async ocrProductImages(imageUrls: string[]): Promise<OcrResult | null> {
    const candidates = pickBackLabelCandidates(imageUrls);
    const attempts: OcrResult["attempts"] = [];
    let best: OcrResult | null = null;

    for (const cand of candidates) {
      try {
        const result = await this.ocrOneImage(cand.url);
        attempts.push({ url: cand.url, reason: cand.reason });

        if (!best || result.payload.confidence.overall > best.payload.confidence.overall) {
          best = { ...result, attempts };
        }

        if (
          result.payload.confidence.has_ingredients &&
          result.payload.confidence.has_nutrition_table
        ) {
          return { ...result, attempts };
        }
      } catch (err) {
        console.warn(`[ocr] candidate ${cand.url} failed:`, (err as Error).message);
        attempts.push({ url: cand.url, reason: `failed: ${(err as Error).message}` });
      }
    }

    return best;
  }

  private async ocrOneImage(url: string): Promise<OcrResult> {
    const bytes = await fetchImage(url);
    const sha = sha256(bytes);

    if (this.supabase && !this.opts.bypassCache) {
      const hit = await readCache(this.supabase, sha);
      if (hit) {
        return {
          payload: hit.payload,
          imageUrl: url,
          imageSha256: sha,
          fromCache: true,
          attempts: [],
        };
      }
    }

    const pre = await preprocessForOcr(bytes);
    const payload = await tesseractOcr(pre.bytes);

    if (this.supabase) {
      await writeCache(this.supabase, { sha, imageUrl: url, payload });
    }

    return { payload, imageUrl: url, imageSha256: sha, fromCache: false, attempts: [] };
  }

  get stats() {
    return { remoteCalls: 0, remoteBudget: 0 };
  }
}

async function fetchImage(url: string, retries = 2): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          accept: "image/*",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 scout",
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(`fetchImage(${url}) failed: ${String(lastErr)}`);
}

export * from "./types";
export { shutdownTesseract } from "./tesseract";
