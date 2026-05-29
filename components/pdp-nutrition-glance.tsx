import {
  formatPackLabel,
  parsePackGrams,
  roundNutrient,
  scaleFromPer100g,
} from "@/lib/products/pack-nutrition";
import { perServeFromNutrition } from "@/lib/scoring/per-serve";
import type { ProductNutrition } from "@/lib/supabase/types";

function fmt(v: number | null | undefined, unit: string): string {
  if (v == null) return "—";
  return `${roundNutrient(v, unit)}${unit === "kcal" ? "" : unit}`;
}

export function PdpNutritionGlance({
  nutrition,
  netWeight,
  priceInr,
}: {
  nutrition: ProductNutrition;
  netWeight?: string | null;
  priceInr?: number | null;
}) {
  const perServe = perServeFromNutrition(nutrition);
  const packGrams = parsePackGrams(netWeight);
  const packLabel = formatPackLabel(netWeight, packGrams);

  const rows: {
    label: string;
    per100: number | null | undefined;
    perServe: number | null | undefined;
    perPack: number | null | undefined;
    unit: string;
  }[] = [
    {
      label: "Energy",
      per100: nutrition.energy_kcal_100g,
      perServe: perServe?.energy_kcal,
      perPack:
        packGrams && nutrition.energy_kcal_100g != null
          ? scaleFromPer100g(nutrition.energy_kcal_100g, packGrams)
          : null,
      unit: "kcal",
    },
    {
      label: "Protein",
      per100: nutrition.protein_g_100g,
      perServe: perServe?.protein_g,
      perPack:
        packGrams && nutrition.protein_g_100g != null
          ? scaleFromPer100g(nutrition.protein_g_100g, packGrams)
          : null,
      unit: "g",
    },
    {
      label: "Carbs",
      per100: nutrition.carbs_g_100g,
      perServe: perServe?.carbs_g,
      perPack:
        packGrams && nutrition.carbs_g_100g != null
          ? scaleFromPer100g(nutrition.carbs_g_100g, packGrams)
          : null,
      unit: "g",
    },
    {
      label: "Sugar",
      per100: nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g,
      perServe: perServe?.sugar_g,
      perPack:
        packGrams && (nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g) != null
          ? scaleFromPer100g(
              (nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g)!,
              packGrams,
            )
          : null,
      unit: "g",
    },
    {
      label: "Fat",
      per100: nutrition.fat_g_100g,
      perServe: perServe?.fat_g,
      perPack:
        packGrams && nutrition.fat_g_100g != null
          ? scaleFromPer100g(nutrition.fat_g_100g, packGrams)
          : null,
      unit: "g",
    },
  ].filter((r) => r.per100 != null || r.perServe != null || r.perPack != null);

  if (!rows.length) return null;

  const hasServe = perServe?.serving_g != null && perServe.serving_g > 0;
  const hasPack = packGrams != null && packGrams > 0;

  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
        Nutrition at a glance
      </p>
      {priceInr != null ? (
        <p className="mt-1 text-[12px] text-(--color-fg-muted)">
          Pack: {packLabel}
          {priceInr > 0 ? ` · ₹${priceInr}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-[12px] text-(--color-fg-muted)">Pack: {packLabel}</p>
      )}
      <div className="mt-3 overflow-hidden rounded-xl border border-(--color-line)">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-(--color-line) bg-(--color-bg-soft) text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
              <th className="px-3 py-2 text-left font-medium" />
              <th className="px-2 py-2 text-right font-medium tabular-nums">/ 100g</th>
              {hasServe ? (
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  / serve
                </th>
              ) : null}
              {hasPack ? (
                <th className="px-2 py-2 text-right font-medium tabular-nums">
                  / pack
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-(--color-line)/60 last:border-0">
                <td className="px-3 py-2 font-medium text-(--color-fg)">{row.label}</td>
                <td className="px-2 py-2 text-right tabular-nums text-(--color-fg-muted)">
                  {fmt(row.per100, row.unit)}
                </td>
                {hasServe ? (
                  <td className="px-2 py-2 text-right tabular-nums text-(--color-fg)">
                    {fmt(row.perServe, row.unit)}
                  </td>
                ) : null}
                {hasPack ? (
                  <td className="px-2 py-2 text-right tabular-nums text-(--color-fg)">
                    {fmt(row.perPack, row.unit)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
