import { NextResponse } from "next/server";
import { getProfileForUser } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const client = supabaseFromBearer(request.headers.get("authorization"));
  if (!client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getProfileForUser(client, data.user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone,
    },
    profile,
  });
}
