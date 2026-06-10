import { Info } from "lucide-react";
import type { ProductNutrition } from "@/lib/supabase/types";

/** Adjuncts (masala, pickle, ghee, sauces) are eaten in pinches, not 100g
 *  plates — anchor the reader to per-use numbers before the per-100g table. */
export function PdpServingNote({
  roleCohort,
  servingG,
  nutrition,
}: {
  roleCohort: string | null | undefined;
  servingG: number | null | undefined;
  nutrition: ProductNutrition | null;
}) {
  if (roleCohort !== "adjunct" || servingG == null || servingG <= 0 || servingG >= 25) {
    return null;
  }

  const scale = servingG / 100;
  const perUse: string[] = [];
  const kcal = nutrition?.energy_kcal_100g;
  const sodium = nutrition?.sodium_mg_100g;
  const fat = nutrition?.fat_g_100g;
  if (kcal != null) perUse.push(`${Math.round(kcal * scale)} kcal`);
  if (sodium != null) perUse.push(`${Math.round(sodium * scale)}mg sodium`);
  if (fat != null) perUse.push(`${(fat * scale).toFixed(1)}g fat`);
  if (!perUse.length) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-(--color-line) bg-(--color-bg-soft)/70 p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-(--color-fg-dim)" aria-hidden />
      <p className="text-[12px] leading-relaxed text-(--color-fg-muted)">
        A typical use is <strong className="text-(--color-fg)">~{Math.round(servingG)}g</strong> —
        that&apos;s {perUse.join(", ")} per use. The per-100g panel overstates what actually lands
        on your plate.
      </p>
    </div>
  );
}
