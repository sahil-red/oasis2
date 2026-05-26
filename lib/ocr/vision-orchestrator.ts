import type { SupabaseClient } from "@supabase/supabase-js";
import { readCache, writeCache } from "./cache";
import { pickBackLabelCandidates } from "./picker";
import type { OcrOrchestratorOptions, OcrResult } from "./types";
import { visionOcrFromUrl } from "./vision-mac";
import { hashImageUrl } from "./hash";

export class VisionMacOrchestrator {
  constructor(
    private readonly _supabase: SupabaseClient | null,
    private readonly _opts: OcrOrchestratorOptions = {},
  ) {}

  async ocrProductImages(imageUrls: string[]): Promise<OcrResult | null> {
    const urls = imageUrls.filter(Boolean);
    if (!urls.length) return null;

    const pick = pickBackLabelCandidates(urls)[0];
    const imageUrl = pick?.url ?? urls[urls.length - 1]!;
    const imageSha256 = hashImageUrl(imageUrl);

    if (!this._opts.bypassCache && this._supabase) {
      const cached = await readCache(this._supabase, imageSha256);
      if (cached?.payload) {
        return {
          payload: cached.payload,
          imageUrl: cached.image_url ?? imageUrl,
          imageSha256,
          fromCache: true,
          attempts: [{ url: imageUrl, reason: pick?.reason ?? "cache_hit" }],
        };
      }
    }

    const attempts: Array<{ url: string; reason: string }> = [];
    for (const url of [imageUrl, ...urls.filter((u) => u !== imageUrl)].slice(0, 3)) {
      attempts.push({ url, reason: url === imageUrl ? (pick?.reason ?? "picked") : "fallback" });
      try {
        const { payload } = await visionOcrFromUrl(url);
        if (this._supabase && !this._opts.bypassCache) {
          await writeCache(this._supabase, {
            sha: imageSha256,
            imageUrl: url,
            payload,
          });
        }
        return { payload, imageUrl: url, imageSha256, fromCache: false, attempts };
      } catch (e) {
        attempts[attempts.length - 1]!.reason += `:${(e as Error).message.slice(0, 60)}`;
      }
    }
    return null;
  }

  get stats() {
    return { engine: "vision" as const };
  }
}
