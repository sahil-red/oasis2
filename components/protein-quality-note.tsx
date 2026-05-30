import { proteinQualityInsight } from "@/lib/goals/protein-quality";
import type { ProductNutrition } from "@/lib/supabase/types";

export function ProteinQualityNote({
  nutrition,
  name,
  category,
}: {
  nutrition: ProductNutrition;
  name: string;
  category?: string | null;
}) {
  const insight = proteinQualityInsight({
    name,
    category,
    protein_g_100g: nutrition.protein_g_100g,
    energy_kcal_100g: nutrition.energy_kcal_100g,
  });
  if (!insight || insight.tier === "complete" || insight.tier === "supplement") return null;

  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-4 py-3 text-[13px] leading-snug text-(--color-fg-muted)">
      <p className="font-medium text-(--color-fg)">{insight.label}</p>
      <p className="mt-0.5">{insight.shortNote}</p>
      {nutrition.protein_g_100g != null && nutrition.energy_kcal_100g != null ? (
        <p className="mt-1 text-[12px] text-(--color-fg-dim)">
          ~{insight.proteinPer100Kcal.toFixed(1)}g protein per 100 kcal — compare to whey (~25+) or
          paneer (~12+).
        </p>
      ) : null}
    </div>
  );
}
