import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

// Unauthenticated insert endpoint — cap per-IP volume so it can't be spammed.
const suggestionLimit = new Map<string, { start: number; count: number }>();
const SUGGESTION_WINDOW_MS = 3_600_000;
const SUGGESTIONS_PER_HOUR = 5;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  if (suggestionLimit.size > 1000) {
    for (const [k, w] of suggestionLimit) {
      if (now - w.start >= SUGGESTION_WINDOW_MS) suggestionLimit.delete(k);
    }
  }
  const window = suggestionLimit.get(ip);
  if (window && now - window.start < SUGGESTION_WINDOW_MS) {
    if (window.count >= SUGGESTIONS_PER_HOUR) {
      return NextResponse.json(
        { error: "Too many suggestions — try again later." },
        { status: 429 },
      );
    }
    window.count++;
  } else {
    suggestionLimit.set(ip, { start: now, count: 1 });
  }

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
