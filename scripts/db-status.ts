import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

async function main() {
  const s = adminClient();
  const [total, withDetail, pendingDetail, withNutrition, scored, ocrPending] =
    await Promise.all([
      s.from("products").select("*", { count: "exact", head: true }),
      s.from("products").select("*", { count: "exact", head: true }).not("raw_payload", "is", null),
      s
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("platform", "blinkit")
        .is("raw_payload", null),
      s.from("products").select("*", { count: "exact", head: true }).not("nutrition", "is", null),
      s.from("core_scores").select("*", { count: "exact", head: true }),
      s
        .from("products")
        .select("*", { count: "exact", head: true })
        .not("raw_payload", "is", null)
        .eq("ocr_status", "pending"),
    ]);
  console.log(
    JSON.stringify({
      total: total.count ?? 0,
      withDetail: withDetail.count ?? 0,
      pendingDetail: pendingDetail.count ?? 0,
      withNutrition: withNutrition.count ?? 0,
      scored: scored.count ?? 0,
      ocrPending: ocrPending.count ?? 0,
    }),
  );
}

main();
