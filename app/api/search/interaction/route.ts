import { NextRequest, NextResponse } from "next/server";
import { recordSearchInteraction, type InteractionKind } from "@/lib/search/v2/interactions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    product_id?: unknown;
    kind?: unknown;
  } | null;

  const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
  const kind = body?.kind === "save" ? "save" : body?.kind === "click" ? "click" : null;

  if (!productId || !kind) {
    return NextResponse.json({ error: "product_id and kind (click|save) required" }, { status: 400 });
  }

  void recordSearchInteraction(productId, kind as InteractionKind);
  return NextResponse.json({ ok: true });
}
