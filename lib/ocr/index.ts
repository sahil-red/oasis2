/**
 * OCR orchestrator.
 *
 * `ocrProductImages(urls)` → `OcrPayload`
 *
 *   1. Iterate candidate images (last → second-to-last → third-to-last).
 *   2. For each candidate:
 *        a. Download bytes (with retry).
 *        b. SHA-256 the bytes; check `image_ocr_cache`.
 *           Cache hit → return immediately.
 *        c. Preprocess with sharp.
 *        d. Run the selected backend (gemini → tesseract → tesseract-only).
 *        e. If confidence below threshold OR no ingredients found:
 *             • on "auto", fall through to Tesseract as a second opinion.
 *             • on Gemini quota exhaustion, fall through too.
 *        f. Persist to cache.
 *   3. Return the first payload that hits `has_ingredients === true` and
 *      `has_nutrition_table === true`. If none, return the best-effort
 *      payload we got, with the lower-confidence flag set.
 *
 * The orchestrator owns the OCR_MAX_CALLS_PER_RUN budget and does the
 * "is this image actually a back label?" decision. Backends are dumb
 * pipes: "image bytes in, OcrPayload out".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./hash";
import { preprocessForOcr } from "./preprocess";
import { pickBackLabelCandidates } from "./picker";
import { geminiOcr } from "./gemini";
import { tesseractOcr } from "./tesseract";
import { readCache, writeCache } from "./cache";
import type { OcrPayload } from "./types";

export type OcrBackend = "gemini" | "tesseract" | "auto";

export interface OcrOrchestratorOptions {
  backend?: OcrBackend;
  /** Hard cap on remote OCR calls per run. Defaults to env OCR_MAX_CALLS_PER_RUN. */
  remoteBudget?: number;
  /** Skip cache lookups (force re-OCR). Defaults to false. */
  bypassCache?: boolean;
  /** Confidence cutoff under which we trigger the fallback backend. Defaults 0.55. */
  confidenceCutoff?: number;
}

export interface OcrResult {
  payload: OcrPayload;
  imageUrl: string;
  imageSha256: string;
  fromCache: boolean;
  attempts: Array<{ url: string; reason: string }>;
}

export class RemoteBudgetExhausted extends Error {
  constructor() {
    super("[ocr] Gemini call budget exhausted for this run.");
  }
}

export class OcrOrchestrator {
  private remoteCalls = 0;
  private readonly opts: Required<OcrOrchestratorOptions>;

  constructor(
    private readonly supabase: SupabaseClient | null,
    opts: OcrOrchestratorOptions = {},
  ) {
    this.opts = {
      backend: opts.backend ?? ((process.env.OCR_BACKEND as OcrBackend) || "auto"),
      remoteBudget:
        opts.remoteBudget ?? Number(process.env.OCR_MAX_CALLS_PER_RUN || 400),
      bypassCache: opts.bypassCache ?? false,
      confidenceCutoff: opts.confidenceCutoff ?? 0.55,
    };
  }

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

        // Good enough → stop trying more images.
        if (
          result.payload.confidence.has_ingredients &&
          result.payload.confidence.has_nutrition_table
        ) {
          return { ...result, attempts };
        }
      } catch (err) {
        if (err instanceof RemoteBudgetExhausted) throw err;
        console.warn(
          `[ocr] candidate ${cand.url} failed:`,
          (err as Error).message,
        );
        attempts.push({ url: cand.url, reason: `failed: ${(err as Error).message}` });
      }
    }

    return best;
  }

  private async ocrOneImage(url: string): Promise<OcrResult> {
    // 1. Fetch bytes.
    const bytes = await fetchImage(url);
    const sha = sha256(bytes);

    // 2. Cache hit?
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

    // 3. Preprocess.
    const pre = await preprocessForOcr(bytes);

    // 4. Run backend(s).
    let payload: OcrPayload;
    const backend = this.opts.backend;

    if (backend === "tesseract") {
      payload = await tesseractOcr(pre.bytes);
    } else if (backend === "gemini") {
      this.assertBudget();
      this.remoteCalls++;
      payload = await geminiOcr(pre.bytes, "image/png");
    } else {
      // auto: try Gemini first; if exhausted OR low confidence, fall back.
      try {
        this.assertBudget();
        this.remoteCalls++;
        payload = await geminiOcr(pre.bytes, "image/png");
        if (payload.confidence.overall < this.opts.confidenceCutoff) {
          const tess = await tesseractOcr(pre.bytes);
          if (tess.confidence.overall > payload.confidence.overall) {
            payload = tess;
          }
        }
      } catch (err) {
        if (err instanceof RemoteBudgetExhausted) {
          // Budget gone — switch this run to tesseract-only.
          console.warn("[ocr] Gemini budget exhausted; using Tesseract.");
          payload = await tesseractOcr(pre.bytes);
        } else {
          console.warn(`[ocr] Gemini failed (${(err as Error).message}); using Tesseract.`);
          payload = await tesseractOcr(pre.bytes);
        }
      }
    }

    // 5. Persist.
    if (this.supabase) {
      await writeCache(this.supabase, { sha, imageUrl: url, payload });
    }

    return { payload, imageUrl: url, imageSha256: sha, fromCache: false, attempts: [] };
  }

  private assertBudget() {
    if (this.remoteCalls >= this.opts.remoteBudget) {
      throw new RemoteBudgetExhausted();
    }
  }

  get stats() {
    return {
      remoteCalls: this.remoteCalls,
      remoteBudget: this.opts.remoteBudget,
    };
  }
}

async function fetchImage(url: string, retries = 2): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          // Some CDNs gate on a non-empty Accept header.
          accept: "image/*",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 oasis-clone",
        },
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
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
