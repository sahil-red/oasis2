#!/usr/bin/env -S pnpm tsx
/**
 * Run OCR over every product where Blinkit's PDP didn't already supply
 * structured ingredients + nutrition.
 *
 *   pnpm ocr                       # default: only OCR what's actually missing
 *   pnpm ocr -- --limit=200        # stop after 200 products
 *   pnpm ocr -- --backend=tesseract  # force fully-local
 *   pnpm ocr -- --with-detail      # only SKUs that finished the PDP scrape
 *   pnpm ocr -- --force            # OCR even products that have platform data
 *                                  # (useful for cross-validation runs)
 *   pnpm ocr -- --bypass-cache     # re-OCR everything (use sparingly)
 *
 * Default skip rule:
 *   A product is considered "platform-complete" and skipped when it has
 *   both a non-empty `ingredients_raw` AND a `nutrition` object that
 *   contains at least one numeric per-100g value. Such products are
 *   marked ocr_status='success' with a sentinel payload so we know the
 *   data didn't come from a label scan.
 *
 * Each OCR'd product gets:
 *   • `products.ocr_image_url`   ← which image we OCR'd
 *   • `products.ocr_payload`     ← full OcrPayload JSON
 *   • `products.ocr_status`      ← 'success' / 'no_label_found' / 'failed'
 *   • `products.ocr_attempted_at` ← now()
 *   • `image_ocr_cache` entry    ← keyed on SHA-256 of the image bytes
 *
 * Notes:
 *   • If the same image is shared across SKUs (variant pack sizes), the
 *     image_ocr_cache de-dupes — only the first product pays the Gemini call.
 *   • The orchestrator self-rate-limits to OCR_MAX_CALLS_PER_RUN. To
 *     process 10k products on Gemini free tier (~1500 RPD), batch this
 *     script across multiple days, or set OCR_BACKEND=tesseract.
 */

import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  OcrOrchestrator,
  RemoteBudgetExhausted,
  shutdownTesseract,
  type OcrBackend,
  type OcrNutrition,
} from "@/lib/ocr";
import { geminiPoolSummary } from "@/lib/ocr/gemini-pool";

loadEnv({ path: ".env.local" });

interface Args {
  limit: number | null;
  backend: OcrBackend | null;
  bypassCache: boolean;
  retryFailed: boolean;
  dryRun: boolean;
  force: boolean;
  withDetail: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let backend: OcrBackend | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    if (a.startsWith("--backend=")) {
      const v = a.split("=")[1];
      if (v === "gemini" || v === "tesseract" || v === "auto") backend = v;
    }
  }
  return {
    limit,
    backend,
    bypassCache: argv.includes("--bypass-cache"),
    retryFailed: argv.includes("--retry-failed"),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    withDetail: argv.includes("--with-detail"),
  };
}

/**
 * True when Blinkit already gave us both ingredients AND at least one
 * per-100g nutrition value. Such products don't need OCR — the platform
 * data is canonical and ready for scoring.
 */
function isPlatformComplete(
  ingredients_raw: string | null,
  nutrition: Record<string, unknown> | null,
): boolean {
  if (!ingredients_raw || !ingredients_raw.trim()) return false;
  if (!nutrition || typeof nutrition !== "object") return false;
  // Need at least one numeric per-100g field outside of metadata keys.
  const META_KEYS = new Set(["source", "extra"]);
  for (const [k, v] of Object.entries(nutrition)) {
    if (META_KEYS.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  if (args.withDetail) {
    console.log("[03-ocr-labels] --with-detail: only products with raw_payload (PDP scraped).");
  }

  const orch = new OcrOrchestrator(supabase, {
    backend: args.backend ?? undefined,
    bypassCache: args.bypassCache,
  });

  const bulkSkipped = await markPlatformCompleteBulk(supabase, args.withDetail, args.dryRun);
  if (bulkSkipped > 0) {
    console.log(`[03-ocr-labels] bulk-marked ${bulkSkipped} platform-complete (skip Gemini).`);
  }

  const statusFilter = args.retryFailed
    ? "pending,failed,no_label_found"
    : "pending";

  let query = supabase
    .from("products")
    .select("id, name, image_urls, ocr_status, ingredients_raw, nutrition")
    .in("ocr_status", statusFilter.split(","))
    .not("image_urls", "is", null)
    .order("scraped_at", { ascending: true });

  if (args.withDetail) {
    query = query.not("raw_payload", "is", null);
  }

  if (args.limit) query = query.limit(args.limit);
  else query = query.limit(10_000);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[03-ocr-labels] failed to fetch products:", error);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("[03-ocr-labels] nothing pending. Done.");
    return;
  }

  const total = rows.length;
  const backend = args.backend ?? process.env.OCR_BACKEND ?? "auto";
  console.log(
    `[03-ocr-labels] processing ${total} products (backend=${backend}, ` +
      `gemini=${geminiPoolSummary()}, budget=${process.env.OCR_MAX_CALLS_PER_RUN ?? "400"}/run)`,
  );
  console.log(
    "[03-ocr-labels] first product may take 30–60s (Tesseract worker cold start + image download).",
  );

  let success = 0;
  let noLabel = 0;
  let failed = 0;
  let skipped = 0;
  const runStart = Date.now();

  for (let i = 0; i < total; i++) {
    const r = rows[i] as {
      id: string;
      name: string;
      image_urls: string[];
      ingredients_raw: string | null;
      nutrition: Record<string, unknown> | null;
    };

    const label = (r.name ?? r.id).slice(0, 48);
    const prefix = `[${i + 1}/${total}]`;
    const bar = progressBar(i + 1, total);
    console.log(`${bar} ${prefix} ${label}`);

    const itemStart = Date.now();

    // Skip products where the platform already provided everything we need.
    if (!args.force && isPlatformComplete(r.ingredients_raw, r.nutrition)) {
      if (!args.dryRun) {
        await updateProduct(supabase, r.id, {
          ocr_status: "success",
          ocr_payload: { source: "platform", skipped_reason: "platform_complete" },
          ocr_attempted_at: new Date().toISOString(),
        });
      }
      skipped++;
      console.log(`         ⚡ platform-complete (skip OCR)  ${elapsed(itemStart)}`);
      continue;
    }

    const imageUrls = (r.image_urls ?? []).filter((u): u is string => !!u);

    if (imageUrls.length === 0) {
      await updateProduct(supabase, r.id, {
        ocr_status: "no_label_found",
        ocr_attempted_at: new Date().toISOString(),
      });
      noLabel++;
      console.log(`         ∅ no images  ${elapsed(itemStart)}`);
      continue;
    }

    console.log(`         … ocr ${imageUrls.length} image(s) (may call Gemini)…`);

    try {
      const result = await orch.ocrProductImages(imageUrls);

      if (!result) {
        await updateProduct(supabase, r.id, {
          ocr_status: "no_label_found",
          ocr_attempted_at: new Date().toISOString(),
        });
        noLabel++;
        continue;
      }

      const isUsable =
        result.payload.confidence.has_ingredients ||
        result.payload.confidence.has_nutrition_table;

      const update: Record<string, unknown> = {
        ocr_image_url: result.imageUrl,
        ocr_payload: result.payload,
        ocr_status: isUsable ? "success" : "no_label_found",
        ocr_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Backfill structured fields from the OCR payload where the platform
      // didn't already give us one.
      if (!r.ingredients_raw && result.payload.ingredients?.length) {
        // Reconstitute a comma-separated ingredients_raw from the OCR list.
        update.ingredients_raw = result.payload.ingredients
          .map((ing) => (ing.percent != null ? `${ing.name} (${ing.percent}%)` : ing.name))
          .join(", ");
      }
      if (!r.nutrition && result.payload.nutrition_per_100g) {
        update.nutrition = {
          ...ocrNutritionToProduct(result.payload.nutrition_per_100g),
          source: "ocr",
        };
      }
      if (result.payload.net_weight) update.net_weight = result.payload.net_weight;

      if (!args.dryRun) {
        await updateProduct(supabase, r.id, update);
      }

      if (isUsable) {
        success++;
        console.log(
          `         ✓ ingredients=${result.payload.confidence.has_ingredients} ` +
            `nutrition=${result.payload.confidence.has_nutrition_table} ` +
            `cache=${result.fromCache}  ${elapsed(itemStart)}`,
        );
      } else {
        noLabel++;
        console.log(`         ∅ low confidence / no label  ${elapsed(itemStart)}`);
      }
    } catch (err) {
      if (err instanceof RemoteBudgetExhausted) {
        console.log(
          `[03-ocr-labels] hit Gemini budget after ${i + 1} products. Re-run later.`,
        );
        break;
      }
      console.warn(`         ✗ ${(err as Error).message.slice(0, 120)}  ${elapsed(itemStart)}`);
      await updateProduct(supabase, r.id, {
        ocr_status: "failed",
        ocr_attempted_at: new Date().toISOString(),
      });
      failed++;
    }

    if ((i + 1) % 10 === 0 || i + 1 === total) {
      const runSec = ((Date.now() - runStart) / 1000).toFixed(0);
      console.log(
        `[03-ocr-labels] checkpoint ${i + 1}/${total} (${runSec}s)  ` +
          `✓${success}  ∅${noLabel}  ⚡${skipped}  ✗${failed}  ` +
          `gemini=${orch.stats.remoteCalls}/${orch.stats.remoteBudget}`,
      );
    }
  }

  const runSec = ((Date.now() - runStart) / 1000).toFixed(0);
  console.log(
    `[03-ocr-labels] done (${runSec}s). ` +
      `success=${success} no_label=${noLabel} skipped_platform=${skipped} failed=${failed} ` +
      `gemini_calls=${orch.stats.remoteCalls}`,
  );

  await shutdownTesseract();
}

function progressBar(done: number, total: number, width = 24): string {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

function elapsed(startMs: number): string {
  const s = (Date.now() - startMs) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${(s / 60).toFixed(1)}m`;
}

function ocrNutritionToProduct(n: OcrNutrition): Record<string, number> {
  const out: Record<string, number> = {};
  if (n.energy_kcal != null) out.energy_kcal_100g = n.energy_kcal;
  if (n.protein_g != null) out.protein_g_100g = n.protein_g;
  if (n.fat_g != null) out.fat_g_100g = n.fat_g;
  if (n.saturated_fat_g != null) out.saturated_fat_g_100g = n.saturated_fat_g;
  if (n.trans_fat_g != null) out.trans_fat_g_100g = n.trans_fat_g;
  if (n.carbs_g != null) out.carbs_g_100g = n.carbs_g;
  if (n.sugar_g != null) out.sugar_g_100g = n.sugar_g;
  if (n.added_sugar_g != null) out.added_sugar_g_100g = n.added_sugar_g;
  if (n.fiber_g != null) out.fiber_g_100g = n.fiber_g;
  if (n.sodium_mg != null) out.sodium_mg_100g = n.sodium_mg;
  return out;
}

async function updateProduct(
  supabase: ReturnType<typeof adminClient>,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) console.warn("[03-ocr-labels] update failed:", error.message);
}

/** Fast path: PDP already has ingredients + nutrition — no label OCR needed. */
async function markPlatformCompleteBulk(
  supabase: ReturnType<typeof adminClient>,
  withDetail: boolean,
  dryRun: boolean,
): Promise<number> {
  const pageSize = 500;
  let marked = 0;
  let offset = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select("id, ingredients_raw, nutrition")
      .eq("ocr_status", "pending")
      .range(offset, offset + pageSize - 1);
    if (withDetail) q = q.not("raw_payload", "is", null);

    const { data, error } = await q;
    if (error) {
      console.warn("[03-ocr-labels] bulk platform skip query failed:", error.message);
      break;
    }
    if (!data?.length) break;

    const ids = data
      .filter((r) =>
        isPlatformComplete(
          r.ingredients_raw as string | null,
          r.nutrition as Record<string, unknown> | null,
        ),
      )
      .map((r) => r.id as string);

    if (ids.length && !dryRun) {
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("products")
        .update({
          ocr_status: "success",
          ocr_payload: { source: "platform", skipped_reason: "platform_complete" },
          ocr_attempted_at: now,
          updated_at: now,
        })
        .in("id", ids);
      if (upErr) console.warn("[03-ocr-labels] bulk update failed:", upErr.message);
      else marked += ids.length;
    } else {
      marked += ids.length;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return marked;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
