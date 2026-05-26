/**
 * Label OCR is disabled (PaddleOCR was too slow for batch catalog use).
 * Nutrition gaps are handled via platform data, reference produce tables, and anomaly guards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OcrPayload } from "./types";

export type OcrBackend = "paddle";

export interface OcrOrchestratorOptions {
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
    private readonly _supabase: SupabaseClient | null,
    private readonly _opts: OcrOrchestratorOptions = {},
  ) {}

  async ocrProductImages(_imageUrls: string[]): Promise<OcrResult | null> {
    return null;
  }

  get stats() {
    return { engine: "disabled" as const };
  }
}

export async function shutdownOcr(): Promise<void> {}

export function paddleSummary(): string {
  return "disabled";
}

export * from "./types";
