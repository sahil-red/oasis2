/**
 * §10 Popularity loop — record clicks/saves on product_search_index.
 */
import { adminClient } from "@/lib/supabase/admin";

export type InteractionKind = "click" | "save";

export async function recordSearchInteraction(
  productId: string,
  kind: InteractionKind,
): Promise<void> {
  try {
    const supabase = adminClient();
    const column = kind === "click" ? "click_count" : "save_count";
    const { data: row } = await supabase
      .from("product_search_index")
      .select("click_count, save_count")
      .eq("product_id", productId)
      .maybeSingle();

    if (!row) return;

    await supabase
      .from("product_search_index")
      .update({
        [column]: Number(row[column] ?? 0) + 1,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", productId);
  } catch {
    // non-fatal — index row may not exist yet
  }
}
