import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/** Called by Vercel deploy hook or manual invocation to purge
 *  all stale cached catalog data after a deployment. */
export async function GET() {
  try {
    revalidateTag("catalog-search", "max");
    revalidateTag("catalog-meta", "max");
    revalidatePath("/search", "layout");
    revalidatePath("/product/[slug]", "page");
    return NextResponse.json({ ok: true, purged: ["catalog-search", "catalog-meta", "/search", "/product/[slug]"] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
