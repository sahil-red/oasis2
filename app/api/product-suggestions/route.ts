import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name =
    typeof body === "object" &&
    body != null &&
    "productName" in body &&
    typeof (body as { productName: unknown }).productName === "string"
      ? (body as { productName: string }).productName.trim()
      : "";

  if (name.length < 2 || name.length > 200) {
    return NextResponse.json(
      { error: "Enter a product name (2–200 characters)." },
      { status: 400 },
    );
  }

  try {
    const supabase = adminClient();
    const { error } = await supabase.from("product_suggestions").insert({
      product_name: name,
    });
    if (error) {
      console.warn("[product-suggestions] insert:", error.message);
      return NextResponse.json(
        { error: "Could not save your suggestion right now." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[product-suggestions]", err);
    return NextResponse.json(
      { error: "Could not save your suggestion right now." },
      { status: 503 },
    );
  }
}
