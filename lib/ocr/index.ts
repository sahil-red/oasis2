/**
 * Label OCR backends:
 * - vision (default on macOS): Apple Vision via ocr-pipeline/ + ocrmac
 * - paddle: disabled in-repo batch path
 * - disabled: no-op orchestrator
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OcrOrchestratorOptions, OcrResult } from "./types";
import { VisionMacOrchestrator } from "./vision-orchestrator";

export type OcrBackend = "vision" | "paddle" | "disabled";

export type { OcrOrchestratorOptions, OcrResult };

export class OcrOrchestrator {
  private delegate: VisionMacOrchestrator | DisabledOrchestrator;

  constructor(
    supabase: SupabaseClient | null,
    opts: OcrOrchestratorOptions = {},
  ) {
    const backend = resolveOcrBackend();
    this.delegate =
      backend === "vision"
        ? new VisionMacOrchestrator(supabase, opts)
        : new DisabledOrchestrator();
  }

  async ocrProductImages(imageUrls: string[]): Promise<OcrResult | null> {
    return this.delegate.ocrProductImages(imageUrls);
  }

  get stats() {
    return this.delegate.stats;
  }
}

class DisabledOrchestrator {
  async ocrProductImages(_imageUrls: string[]): Promise<OcrResult | null> {
    return null;
  }
  get stats() {
    return { engine: "disabled" as const };
  }
}

function resolveOcrBackend(): OcrBackend {
  const raw = (process.env.OCR_BACKEND ?? "vision").trim().toLowerCase();
  if (raw === "disabled" || raw === "off" || raw === "none") return "disabled";
  if (raw === "paddle") return "paddle";
  return "vision";
}

import { shutdownVisionOcr } from "./vision-mac";

export async function shutdownOcr(): Promise<void> {
  await shutdownVisionOcr();
}

export function paddleSummary(): string {
  const b = resolveOcrBackend();
  if (b === "vision") return "vision (Apple OCR / ocrmac)";
  if (b === "paddle") return "paddle (not wired — use OCR_BACKEND=vision)";
  return "disabled";
}

export * from "./types";
