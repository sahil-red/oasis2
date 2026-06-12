import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getCanonicalSiblings } from "@/lib/search/v2/canonical-variants";
import { getSearchIndexSnapshot, type SearchIndexSnapshot } from "@/lib/search/v2/index-queries";
import { normalizeProductImageUrls } from "@/lib/products/catalog-hero-image";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("product_id")?.trim();
  if (!productId) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  let snapshot: SearchIndexSnapshot;
  try {
    snapshot = await getSearchIndexSnapshot();
  } catch (e) {
    console.error("[canonical] index snapshot failed:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  let siblings: Array<{ product_id: string; slug: string; name: string; brand: string | null; category: string | null; subcategory: string | null; price_inr: number | null; scout_score: number | null; data_quality_score: number | null; canonical_product_id: string | null }>;
  try {
    siblings = getCanonicalSiblings(snapshot.index, productId);
  } catch (e) {
    console.error("[canonical] sibling resolution failed:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const ids = siblings.map((s) => s.product_id);
  const display = new Map<string, { image_urls: string[]; net_weight: string | null; mrp_inr: number | null }>();

  if (ids.length) {
    const { data } = await adminClient()
      .from("products")
      // ocr_payload was dropped from `products`; selecting it throws and blanks images.
      .select("id, image_urls, net_weight, mrp_inr, ocr_image_url")
      .in("id", ids);
    for (const row of data ?? []) {
      try {
        const rawUrls: string[] = Array.isArray(row.image_urls) ? row.image_urls : [];
        const images = normalizeProductImageUrls(
          rawUrls,
          { ocrImageUrl: (row.ocr_image_url as string | null) ?? null },
        );
        display.set(String(row.id), {
          image_urls: images.length ? images.slice(0, 1) : [],
          net_weight: (row.net_weight as string) ?? null,
          mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
        });
      } catch (e) {
        console.error("[canonical/route] row error", row.id, e);
        display.set(String(row.id), {
          image_urls: Array.isArray(row.image_urls) ? row.image_urls.slice(0, 1) : [],
          net_weight: (row.net_weight as string) ?? null,
          mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
        });
      }
    }
  }

  const items = siblings.map((row) => {
    const extra = display.get(row.product_id);
    return {
      id: row.product_id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      category: row.category,
      subcategory: row.subcategory,
      net_weight: extra?.net_weight ?? null,
      price_inr: row.price_inr,
      mrp_inr: extra?.mrp_inr ?? null,
      image_urls: extra?.image_urls ?? [],
      scout_score: row.scout_score,
      data_quality_score: row.data_quality_score,
      is_canonical_rep: row.product_id === (row.canonical_product_id ?? row.product_id),
    };
  });

  return NextResponse.json({
    canonical_product_id: siblings[0]?.canonical_product_id ?? productId,
    items,
  });
}
