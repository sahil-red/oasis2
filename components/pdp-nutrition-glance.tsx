import { NutritionFactsTable } from "@/components/nutrition-facts-table";
import { detectNutritionAnomalies, type NutritionContext } from "@/lib/nutrition/anomaly";
import { resolveNutritionDisplay } from "@/lib/nutrition/nutrition-display";
import type { ProductNutrition } from "@/lib/supabase/types";

export function PdpNutritionGlance({
  nutrition,
  netWeight,
  priceInr,
  name,
  category,
  subcategory,
}: {
  nutrition: ProductNutrition;
  netWeight?: string | null;
  priceInr?: number | null;
  name?: string;
  category?: string | null;
  subcategory?: string | null;
}) {
  const { rows, hasServe, serveG, packLabel } = resolveNutritionDisplay(nutrition, netWeight);
  if (!rows.length) return null;

  const ctx: NutritionContext | null = name ? { name, category, subcategory } : null;
  const anomalies = ctx ? detectNutritionAnomalies(nutrition, ctx) : [];
  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");

  const metaParts = [
    packLabel !== "pack" ? packLabel : null,
    priceInr != null && priceInr > 0 ? `₹${priceInr}` : null,
    hasServe && serveG ? `${serveG}g serve` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
          Nutrition information
        </p>
        {metaParts.length > 0 ? (
          <p className="mt-1 text-[12px] text-(--color-fg-muted)">{metaParts.join(" · ")}</p>
        ) : null}
      </div>

      {critical.length > 0 ? (
        <div className="mt-3 rounded-xl border border-(--color-bad)/30 bg-(--color-bad)/[0.06] px-3 py-2.5 text-[12px] leading-snug text-(--color-bad)">
          <p className="font-medium">Nutrition data looks wrong</p>
          <ul className="mt-1 list-inside list-disc opacity-90">
            {critical.map((a) => (
              <li key={a.code}>{a.message}</li>
            ))}
          </ul>
        </div>
      ) : warnings.length > 0 ? (
        <div className="mt-3 rounded-xl border border-(--color-warn)/30 bg-(--color-warn)/[0.06] px-3 py-2.5 text-[12px] leading-snug text-(--color-warn)">
          {warnings.map((a) => a.message).join(" · ")}
        </div>
      ) : null}

      {typeof nutrition.extra?.nutrition_gap_fill === "string" ? (
        <p className="mt-3 text-[11px] leading-snug text-(--color-fg-muted)">
          Some values missing on the pack label — gaps filled from a paneer reference table.
        </p>
      ) : null}

      <div className="mt-3">
        <NutritionFactsTable nutrition={nutrition} netWeight={netWeight} />
      </div>
    </div>
  );
}
