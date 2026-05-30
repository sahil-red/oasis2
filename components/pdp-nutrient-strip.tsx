import type { ProductNutrition } from "@/lib/supabase/types";

function fmt(value: number, unit: string): string {
  if (unit === "kcal") return `${Math.round(value)}`;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}${unit}`;
}

export function PdpNutrientStrip({ nutrition }: { nutrition: ProductNutrition | null }) {
  if (!nutrition) return null;

  const sugar = nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g;
  const tiles = [
    nutrition.energy_kcal_100g != null
      ? { label: "kcal", value: fmt(nutrition.energy_kcal_100g, "kcal") }
      : null,
    sugar != null ? { label: "sugar", value: fmt(sugar, "g") } : null,
    nutrition.protein_g_100g != null
      ? { label: "protein", value: fmt(nutrition.protein_g_100g, "g") }
      : null,
    nutrition.fat_g_100g != null ? { label: "fat", value: fmt(nutrition.fat_g_100g, "g") } : null,
  ].filter((x): x is { label: string; value: string } => Boolean(x));

  if (tiles.length < 2) return null;

  return (
    <div className="mt-5 grid grid-cols-4 gap-2">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-3 py-2.5 text-center"
        >
          <p className="font-display text-xl font-semibold leading-none tabular-nums text-(--color-fg)">
            {tile.value}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-(--color-fg-dim)">
            {tile.label}
          </p>
        </div>
      ))}
    </div>
  );
}
