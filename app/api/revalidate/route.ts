import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/** Called by Vercel deploy hook or manual invocation to purge
 *  all stale cached catalog data after a deployment. */
export async function GET() {
  try {
    revalidateTag("catalog-search", "max");
    revalidateTag("catalog-meta", "max");
    return NextResponse.json({ ok: true, purged: ["catalog-search", "catalog-meta"] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
