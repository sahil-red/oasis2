"use client";

import { NutritionFactsTable } from "@/components/nutrition-facts-table";
import { detectNutritionAnomalies, type NutritionContext } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

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
  const ctx: NutritionContext | null = name ? { name, category, subcategory } : null;
  const anomalies = ctx ? detectNutritionAnomalies(nutrition, ctx) : [];
  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");

  return (
    <div>
      {critical.length > 0 ? (
        <div className="mb-3 rounded-xl border border-(--color-bad)/30 bg-(--color-bad)/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-(--color-bad)">
          <p className="font-medium">Nutrition data looks wrong</p>
          <ul className="mt-1 list-inside list-disc opacity-90">
            {critical.map((a) => (
              <li key={a.code}>{a.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 && critical.length === 0 ? (
        <div className="mb-3 rounded-xl border border-(--color-warn)/30 bg-(--color-warn)/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-(--color-warn)">
          {warnings.map((a) => a.message).join(" · ")}
        </div>
      ) : null}

      <NutritionFactsTable nutrition={nutrition} netWeight={netWeight} className="rounded-2xl" />
    </div>
  );
}
