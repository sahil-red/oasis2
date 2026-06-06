import { adminClient } from "@/lib/supabase/admin";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { runSearchV2 } from "@/lib/search/v2/pipeline";

export type AlertRecord = {
  id: string;
  user_id: string;
  query: string;
  preferences: unknown;
  last_match_count: number | null;
  last_notified_at: string | null;
};

export type AlertTrigger = {
  id: string;
  user_id: string;
  query: string;
  new_matches: number;
  previous: number;
};

/** Run V2 search for each alert and update match counts; returns newly triggered alerts. */
export async function runAlertsForRecords(alerts: AlertRecord[]): Promise<AlertTrigger[]> {
  const supabase = adminClient();
  const triggered: AlertTrigger[] = [];

  for (const alert of alerts) {
    const prefs = (alert.preferences as Record<string, unknown>) ?? {};
    const result = await runSearchV2(String(alert.query), {
      limit: 12,
      preferences: prefs as AiSearchPreferences,
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
      triggered.push({
        id: String(alert.id),
        user_id: String(alert.user_id),
        query: String(alert.query),
        new_matches: count,
        previous: prev,
      });
    }
  }

  return triggered;
}

/** Process all active alerts (cron). */
export async function runAllActiveAlerts(opts?: { limit?: number }) {
  const supabase = adminClient();
  let query = supabase.from("search_alerts").select("*").eq("active", true);
  if (opts?.limit) query = query.limit(opts.limit);
  const { data: alerts, error } = await query;
  if (error) throw new Error(error.message);

  const triggered = await runAlertsForRecords((alerts ?? []) as AlertRecord[]);
  return { processed: alerts?.length ?? 0, triggered };
}
