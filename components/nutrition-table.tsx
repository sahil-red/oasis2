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

export function NutritionTable({ nutrition }: { nutrition: ProductNutrition }) {
  const rows = ROWS.filter((r) => nutrition[r.key] != null);

  if (!rows.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">No per-100g nutrition values on file yet.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-(--color-line)">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-line) bg-(--color-panel) text-left text-xs uppercase tracking-wider text-(--color-fg-dim)">
            <th className="px-4 py-3 font-normal">Per 100g</th>
            <th className="px-4 py-3 font-normal text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, unit }) => (
            <tr key={key} className="border-b border-(--color-line) last:border-0">
              <td className="px-4 py-2.5 text-(--color-fg-muted)">{label}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-(--color-fg)">
                {nutrition[key] as number} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {nutrition.source ? (
        <p className="border-t border-(--color-line) px-4 py-2 text-xs text-(--color-fg-dim)">
          Source: {nutrition.source}
        </p>
      ) : null}
    </div>
  );
}
