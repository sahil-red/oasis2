import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getCanonicalSiblings } from "@/lib/search/v2/canonical-variants";
import { getSearchIndexSnapshot } from "@/lib/search/v2/index-queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("product_id")?.trim();
  if (!productId) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const snapshot = await getSearchIndexSnapshot();
  const siblings = getCanonicalSiblings(snapshot.index, productId);

  const ids = siblings.map((s) => s.product_id);
  const display = new Map<string, { image_urls: string[]; net_weight: string | null; mrp_inr: number | null }>();

  if (ids.length) {
    const { data } = await adminClient()
      .from("products")
      .select("id, image_urls, net_weight, mrp_inr")
      .in("id", ids);
    for (const row of data ?? []) {
      display.set(String(row.id), {
        image_urls: Array.isArray(row.image_urls) ? row.image_urls.slice(0, 1) : [],
        net_weight: (row.net_weight as string) ?? null,
        mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
      });
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
