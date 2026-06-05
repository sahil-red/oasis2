import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const client = supabaseFromBearer(req.headers.get("authorization"));
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data, error: dbErr } = await supabase
    .from("search_history")
    .select("id, query, intent_tier, rank_source, result_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}

export async function POST(req: NextRequest) {
  const client = supabaseFromBearer(req.headers.get("authorization"));
  if (!client) return NextResponse.json({ ok: false });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false });

  const body = await req.json().catch(() => null) as {
    query?: string;
    intent_tier?: string;
    rank_source?: string;
    result_count?: number;
  } | null;
  if (!body?.query?.trim()) return NextResponse.json({ ok: false });

  const supabase = adminClient();
  await supabase.from("search_history").insert({
    user_id: user.id,
    query: body.query.trim().slice(0, 200),
    intent_tier: body.intent_tier ?? null,
    rank_source: body.rank_source ?? null,
    result_count: body.result_count ?? null,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const client = supabaseFromBearer(req.headers.get("authorization"));
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const supabase = adminClient();

  if (id) {
    await supabase.from("search_history").delete().eq("id", id).eq("user_id", user.id);
  } else {
    // Clear all
    await supabase.from("search_history").delete().eq("user_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
