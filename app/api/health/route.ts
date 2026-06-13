export const dynamic = "force-dynamic";

export async function GET() {
  // Warm the Supabase connection pool so real searches don't pay
  // the 3-5s cold-connection cost (TCP handshake, SSL negotiation).
  try {
    const { adminClient } = await import("@/lib/supabase/admin");
    await adminClient().from("products").select("id").limit(1);
  } catch { /* best effort — don't fail the health check on DB error */ }

  return Response.json({ ok: true, at: Date.now() });
}
