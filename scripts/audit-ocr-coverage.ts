#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { urlsMatchImage } from "@/lib/products/catalog-hero-image";

config({ path: ".env.local" });

async function main() {
  const sb = adminClient();

  const { count: total } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto");

  const { count: withImages } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto")
    .not("image_urls", "is", null);

  const { count: withOcrUrl } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto")
    .not("ocr_image_url", "is", null);

  const { count: ocrSuccess } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto")
    .eq("ocr_status", "success");

  const { count: platformComplete } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto")
    .eq("ocr_status", "success")
    .is("ocr_image_url", null);

  let offset = 0;
  const page = 1000;
  let multi = 0;
  let multiWithOcrUrl = 0;
  let ocrUrlInGallery = 0;
  let ocrUrlNotInGallery = 0;

  while (true) {
    const { data, error } = await sb
      .from("products")
      .select("image_urls, ocr_image_url")
      .eq("platform", "zepto")
      .not("image_urls", "is", null)
      .range(offset, offset + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;

    for (const r of rows) {
      const urls = (r.image_urls as string[]).filter(Boolean);
      if (urls.length < 2) continue;
      multi++;
      const ocr = r.ocr_image_url as string | null;
      if (!ocr?.trim()) continue;
      multiWithOcrUrl++;
      const inGallery = urls.some((u) => urlsMatchImage(u, ocr));
      if (inGallery) ocrUrlInGallery++;
      else ocrUrlNotInGallery++;
    }

    offset += page;
    if (rows.length < page) break;
  }

  console.log({
    total,
    withImages,
    withOcrUrl,
    ocrSuccess,
    platformCompleteNoOcrImage: platformComplete,
    multiImageProducts: multi,
    multiWithOcrUrl,
    ocrUrlInGallery,
    ocrUrlNotInGallery,
  });
}

main();
