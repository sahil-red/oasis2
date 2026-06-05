#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  orderCatalogImageUrls,
  needsHeroReorder,
  scoreHeroCandidate,
  looksLikeLabelImageUrl,
  looksLikeHeroImageUrl,
} from "@/lib/products/catalog-hero-image";

config({ path: ".env.local" });

async function main() {
  const sb = adminClient();
  let offset = 0;
  const page = 500;
  let multi = 0;
  let flagged = 0;
  let heroChanges = 0;
  let ocrFirst = 0;
  const samples: string[] = [];

  while (true) {
    const { data, error } = await sb
      .from("products")
      .select("slug, image_urls, ocr_image_url")
      .not("image_urls", "is", null)
      .range(offset, offset + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;

    for (const r of rows) {
      const urls = (r.image_urls as string[]).filter(Boolean);
      if (urls.length < 2) continue;
      multi++;
      const ocr = (r.ocr_image_url as string | null) ?? null;
      if (ocr && urls[0] === ocr) ocrFirst++;
      if (needsHeroReorder(urls, { ocrImageUrl: ocr })) flagged++;
      const ordered = orderCatalogImageUrls(urls, { ocrImageUrl: ocr, ocrPayload: null });
      if (ordered[0] !== urls[0]) {
        heroChanges++;
        if (samples.length < 8) {
          samples.push(
            `${r.slug}\n  [0] ${urls[0]?.slice(-72)}\n  →   ${ordered[0]?.slice(-72)}`,
          );
        }
      }
    }
    offset += page;
    if (rows.length < page) break;
  }

  console.log({ multi, flagged, heroChanges, ocrFirst });
  console.log("samples:\n" + samples.join("\n\n"));
}

main();
