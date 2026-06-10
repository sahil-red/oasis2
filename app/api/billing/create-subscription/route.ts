import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { formatInr, planForInterval, type PlanInterval } from "@/lib/billing/plans";
import {
  createRazorpayCustomer,
  createRazorpaySubscription,
  ensureRazorpayPlan,
} from "@/lib/billing/razorpay";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = supabaseFromBearer(request.headers.get("authorization"));
  if (!client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { interval?: string };
  const interval: PlanInterval = body.interval === "yearly" ? "yearly" : "monthly";
  const plan = planForInterval(interval);

  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("razorpay_customer_id, full_name, email, phone, plan")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.plan === "plus") {
    return NextResponse.json({ error: "Already subscribed" }, { status: 400 });
  }

  let customerId = profile?.razorpay_customer_id as string | null;
  if (!customerId) {
    customerId = await createRazorpayCustomer({
      name: profile?.full_name ?? data.user.user_metadata?.full_name,
      email: profile?.email ?? data.user.email,
      contact: profile?.phone ?? data.user.phone,
    });
    await admin
      .from("profiles")
      .update({ razorpay_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("id", data.user.id);
  }

  const planId = await ensureRazorpayPlan(interval);
  const sub = await createRazorpaySubscription({
    customerId,
    planId,
    // Razorpay total_count is the number of billing cycles to run.
    totalCount: interval === "yearly" ? 10 : 120,
  });

  await admin.from("subscriptions").insert({
    user_id: data.user.id,
    razorpay_subscription_id: sub.id,
    razorpay_plan_id: planId,
    status: sub.status ?? "created",
  });

  return NextResponse.json({
    subscription_id: sub.id,
    checkout_url: sub.short_url ?? null,
    key_id: process.env.RAZORPAY_KEY_ID,
    plan: {
      name: plan.name,
      amount_display: formatInr(plan.amount_paise),
      interval: plan.interval,
    },
  });
}
