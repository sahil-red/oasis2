import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { SCOUT_PLUS_PLAN, formatInr } from "@/lib/billing/plans";
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

  const planId = await ensureRazorpayPlan();
  const sub = await createRazorpaySubscription({ customerId, planId });

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
      name: SCOUT_PLUS_PLAN.name,
      amount_display: formatInr(SCOUT_PLUS_PLAN.amount_paise),
      interval: SCOUT_PLUS_PLAN.interval,
    },
  });
}
