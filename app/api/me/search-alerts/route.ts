import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { runSearchV2 } from "@/lib/search/v2/pipeline";
import { isSearchV2Enabled } from "@/lib/search/v2/index-queries";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function requireUser(req: NextRequest) {
  const client = supabaseFromBearer(req.headers.get("authorization"));
  if (!client) return null;
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** List active alerts for the user. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminClient()
    .from("search_alerts")
    .select("id, query, preferences, last_match_count, last_notified_at, active, created_at, saved_search_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

/**
 * Run alert checks — compares current result count vs last notified.
 * Call from cron or manually; returns alerts with new matches.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSearchV2Enabled()) {
    return NextResponse.json({ error: "SEARCH_V2_ENABLED required for alerts" }, { status: 503 });
  }

  const supabase = adminClient();
  const { data: alerts } = await supabase
    .from("search_alerts")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true);

  const updates: Array<{ id: string; query: string; new_matches: number; previous: number }> = [];

  for (const alert of alerts ?? []) {
    const prefs = (alert.preferences as Record<string, unknown>) ?? {};
    const result = await runSearchV2(String(alert.query), {
      limit: 12,
      preferences: prefs as import("@/lib/search/ai-usage").AiSearchPreferences,
    });
    const count = result.items.length;
    const prev = Number(alert.last_match_count ?? 0);
    const hasNew = count > prev;

    await supabase
      .from("search_alerts")
      .update({
        last_match_count: count,
        last_notified_at: hasNew ? new Date().toISOString() : alert.last_notified_at,
      })
      .eq("id", alert.id);

    if (hasNew) {
      updates.push({ id: String(alert.id), query: String(alert.query), new_matches: count, previous: prev });
    }
  }

  return NextResponse.json({ triggered: updates });
}
