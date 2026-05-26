import {
  formatPackLabel,
  parsePackGrams,
  roundNutrient,
  scaleFromPer100g,
} from "@/lib/products/pack-nutrition";
import { detectNutritionAnomalies, type NutritionContext } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

const ROWS: { key: keyof ProductNutrition; label: string; unit: string }[] = [
  { key: "energy_kcal_100g", label: "Energy", unit: "kcal" },
  { key: "protein_g_100g", label: "Protein", unit: "g" },
  { key: "fat_g_100g", label: "Fat", unit: "g" },
  { key: "saturated_fat_g_100g", label: "Saturated fat", unit: "g" },
  { key: "trans_fat_g_100g", label: "Trans fat", unit: "g" },
  { key: "carbs_g_100g", label: "Carbohydrates", unit: "g" },
  { key: "sugar_g_100g", label: "Sugar", unit: "g" },
  { key: "added_sugar_g_100g", label: "Added sugar", unit: "g" },
  { key: "fiber_g_100g", label: "Fiber", unit: "g" },
  { key: "sodium_mg_100g", label: "Sodium", unit: "mg" },
];

export function NutritionTable({
  nutrition,
  netWeight,
  name,
  category,
  subcategory,
}: {
  nutrition: ProductNutrition;
  netWeight?: string | null;
  name?: string;
  category?: string | null;
  subcategory?: string | null;
}) {
  const ctx: NutritionContext | null = name
    ? { name, category, subcategory }
    : null;
  const anomalies = ctx ? detectNutritionAnomalies(nutrition, ctx) : [];
  const warnings = anomalies.filter((a) => a.severity === "warning");
  const rows = ROWS.filter((r) => nutrition[r.key] != null);
  const packGrams = parsePackGrams(netWeight);
  const showPack = packGrams != null && packGrams > 0;
  const packLabel = formatPackLabel(netWeight, packGrams);

  if (!rows.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">No per-100g nutrition values on file yet.</p>
    );
  }

  return (
    <div>
      {warnings.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-[13px] leading-snug text-amber-950">
          <p className="font-medium">Nutrition data may be inaccurate</p>
          <ul className="mt-1 list-inside list-disc text-amber-900/90">
            {warnings.map((a) => (
              <li key={a.code}>{a.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-(--color-line)">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-line) bg-(--color-panel) text-left text-xs uppercase tracking-wider text-(--color-fg-dim)">
            <th className="px-4 py-3 font-normal">Nutrient</th>
            <th className="px-4 py-3 font-normal text-right">Per 100g</th>
            {showPack ? (
              <th className="px-4 py-3 font-normal text-right">Per pack ({packLabel})</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, unit }) => {
            const per100 = nutrition[key] as number;
            const perPack =
              showPack && packGrams ? roundNutrient(scaleFromPer100g(per100, packGrams), unit) : null;
            return (
              <tr key={key} className="border-b border-(--color-line) last:border-0">
                <td className="px-4 py-2.5 text-(--color-fg-muted)">{label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-(--color-fg)">
                  {per100} {unit}
                </td>
                {showPack ? (
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-(--color-fg)">
                    {perPack} {unit}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {showPack ? (
        <p className="border-t border-(--color-line) px-4 py-2 text-xs text-(--color-fg-dim)">
          Pack column scales label values for {packLabel} — what you get in one unit you buy.
        </p>
      ) : null}
      {nutrition.source ? (
        <p className="border-t border-(--color-line) px-4 py-2 text-xs text-(--color-fg-dim)">
          Source: {nutrition.source}
        </p>
      ) : null}
      </div>
    </div>
  );
}
