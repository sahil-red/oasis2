import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { setUserPlanPlus } from "@/lib/auth/profile";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";

export const dynamic = "force-dynamic";

type RazorpayWebhook = {
  event: string;
  payload?: {
    subscription?: { entity?: { id?: string; status?: string; current_end?: number } };
    payment?: { entity?: { id?: string; order_id?: string; status?: string } };
    order?: { entity?: { id?: string; notes?: Record<string, string>; amount?: number } };
  };
};

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let body: RazorpayWebhook;
  try {
    body = JSON.parse(raw) as RazorpayWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const event = body.event;
  const subEntity = body.payload?.subscription?.entity;
  const subId = subEntity?.id;
  if (!subId) {
    // Standard Checkout: order.paid event
    if (event === "order.paid" || event === "payment.captured") {
      const orderId = body.payload?.order?.entity?.id ?? body.payload?.payment?.entity?.order_id;
      const userId = body.payload?.order?.entity?.notes?.user_id;
      if (orderId && userId) {
        await setUserPlanPlus(admin, userId, orderId, null);
        await admin.from("subscriptions").update({
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("razorpay_subscription_id", orderId);
      }
    }
    return NextResponse.json({ ok: true });
  }

  const admin = adminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("razorpay_subscription_id", subId)
    .maybeSingle();

  if (!row?.user_id) {
    return NextResponse.json({ ok: true });
  }

  const activeEvents = new Set([
    "subscription.authenticated",
    "subscription.activated",
    "subscription.charged",
  ]);
  const cancelEvents = new Set([
    "subscription.cancelled",
    "subscription.halted",
    "subscription.completed",
  ]);

  if (activeEvents.has(event)) {
    const periodEnd = subEntity?.current_end
      ? new Date(subEntity.current_end * 1000).toISOString()
      : null;
    await setUserPlanPlus(admin, row.user_id, subId, periodEnd);
    await admin
      .from("subscriptions")
      .update({
        status: subEntity?.status ?? "active",
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", subId);
  } else if (cancelEvents.has(event)) {
    await admin
      .from("profiles")
      .update({ plan: "free", updated_at: new Date().toISOString() })
      .eq("id", row.user_id);
    await admin
      .from("subscriptions")
      .update({
        status: subEntity?.status ?? "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", subId);
  }

  return NextResponse.json({ ok: true });
}
