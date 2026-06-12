import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  const client = supabaseFromBearer(request.headers.get("authorization"));
  if (!client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: auth, error: authErr } = await client.auth.getUser();
  if (authErr || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cancel_at_cycle_end } = (await request.json().catch(() => ({}))) as {
    cancel_at_cycle_end?: boolean;
  };

  const admin = adminClient();

  // Fetch the user's active subscription
  const { data: sub } = await admin
    .from("subscriptions")
    .select("razorpay_subscription_id, status")
    .eq("user_id", auth.user.id)
    .in("status", ["active", "pending"])
    .maybeSingle();

  if (!sub?.razorpay_subscription_id) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  const authHeader = `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;

  try {
    // Cancel at Razorpay — cancel_at_cycle_end=false cancels immediately
    const cancelRes = await fetch(
      `${RAZORPAY_BASE}/subscriptions/${sub.razorpay_subscription_id}/cancel`,
      {
        method: "POST",
        headers: { authorization: authHeader, "content-type": "application/json" },
        body: JSON.stringify({ cancel_at_cycle_end: cancel_at_cycle_end ?? false }),
      },
    );

    if (!cancelRes.ok) {
      const errBody = await cancelRes.json().catch(() => ({}));
      const msg =
        typeof errBody === "object" && errBody && "error" in errBody
          ? JSON.stringify((errBody as { error: unknown }).error)
          : cancelRes.statusText;
      return NextResponse.json(
        { error: `Razorpay cancellation failed: ${msg}` },
        { status: 502 },
      );
    }

    // Update local DB
    await admin
      .from("profiles")
      .update({ plan: "free", updated_at: new Date().toISOString() })
      .eq("id", auth.user.id);

    await admin
      .from("subscriptions")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", sub.razorpay_subscription_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[billing/cancel-subscription]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Cancellation failed — please try again or contact support." },
      { status: 502 },
    );
  }
}
