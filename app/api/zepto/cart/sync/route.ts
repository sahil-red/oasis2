import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getValidAccessToken,
  getZeptoConnection,
} from "@/lib/zepto/connection-store";
import { callZeptoTool, listZeptoTools } from "@/lib/zepto/mcp-client";
import { zeptoConnectionKeyFromCookieHeader } from "@/lib/zepto/request";

async function tryAddToCart(
  accessToken: string,
  variantId: string,
  quantity: number,
): Promise<{ ok: boolean; detail?: string }> {
  const attempts: Record<string, unknown>[] = [
    { product_variant_id: variantId, quantity },
    { productVariantId: variantId, quantity },
    { product_id: variantId, quantity },
    { pvid: variantId, quantity },
  ];

  for (const args of attempts) {
    try {
      await callZeptoTool(accessToken, "add_to_cart", args);
      return { ok: true };
    } catch {
      // try next shape
    }
  }
  return { ok: false, detail: "add_to_cart tool call failed" };
}

export async function POST(request: Request) {
  const key = zeptoConnectionKeyFromCookieHeader(request.headers.get("cookie"));
  if (!key) {
    return NextResponse.json({ error: "Connect your Zepto account first" }, { status: 401 });
  }

  let body: { items?: Array<{ slug: string; qty?: number }> } = {};
  try {
    body = (await request.json()) as { items?: Array<{ slug: string; qty?: number }> };
  } catch {
    body = {};
  }

  const items = body.items?.filter((i) => i.slug?.trim()) ?? [];
  if (!items.length) {
    return NextResponse.json({ error: "No items to sync" }, { status: 400 });
  }

  try {
    const conn = await getZeptoConnection(key);
    if (!conn) {
      return NextResponse.json({ error: "Zepto not connected" }, { status: 401 });
    }

    const accessToken = await getValidAccessToken(conn);
    const slugs = items.map((i) => i.slug);
    const qtyBySlug = new Map(items.map((i) => [i.slug, Math.max(1, i.qty ?? 1)]));

    const supabase = adminClient();
    const { data: products, error } = await supabase
      .from("products")
      .select("slug, name, zepto_sku")
      .in("slug", slugs)
      .eq("platform", "zepto");

    if (error) throw new Error(error.message);

    const results: Array<{
      slug: string;
      name: string;
      status: "added" | "skipped" | "failed";
      reason?: string;
    }> = [];

    for (const row of products ?? []) {
      const sku = row.zepto_sku as string | null;
      const slug = row.slug as string;
      const name = row.name as string;
      const qty = qtyBySlug.get(slug) ?? 1;
      if (!sku) {
        results.push({ slug, name, status: "skipped", reason: "No Zepto SKU" });
        continue;
      }
      const add = await tryAddToCart(accessToken, sku, qty);
      results.push({
        slug,
        name,
        status: add.ok ? "added" : "failed",
        reason: add.detail,
      });
    }

    for (const item of items) {
      if (results.some((r) => r.slug === item.slug)) continue;
      results.push({
        slug: item.slug,
        name: item.slug,
        status: "skipped",
        reason: "Not in catalog",
      });
    }

    return NextResponse.json({
      ok: true,
      results,
      added: results.filter((r) => r.status === "added").length,
      zepto_cart_url: "https://www.zepto.com/?cart=open",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    let tools: string[] = [];
    try {
      const conn = await getZeptoConnection(key);
      if (conn) {
        const token = await getValidAccessToken(conn);
        const listed = await listZeptoTools(token);
        tools = listed.map((t) => t.name);
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: message, tools_hint: tools.length ? tools : undefined },
      { status: 502 },
    );
  }
}
