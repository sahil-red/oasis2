"use client";

import { useMemo } from "react";
import {
  formatPackLabel,
  parsePackGrams,
  scaleFromPer100g,
} from "@/lib/products/pack-nutrition";
import { perServeFromNutrition } from "@/lib/scoring/per-serve";
import { detectNutritionAnomalies, type NutritionContext } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

const ROWS: {
  key: keyof ProductNutrition;
  perServe: string;
  label: string;
  unit: string;
  emphasis?: boolean;
}[] = [
  { key: "energy_kcal_100g", perServe: "energy_kcal", label: "Energy", unit: "kcal", emphasis: true },
  { key: "protein_g_100g", perServe: "protein_g", label: "Protein", unit: "g", emphasis: true },
  { key: "fat_g_100g", perServe: "fat_g", label: "Fat", unit: "g", emphasis: true },
  { key: "saturated_fat_g_100g", perServe: "saturated_fat_g", label: "  of which saturated", unit: "g" },
  { key: "trans_fat_g_100g", perServe: "trans_fat_g", label: "  of which trans", unit: "g" },
  { key: "carbs_g_100g", perServe: "carbs_g", label: "Carbohydrates", unit: "g", emphasis: true },
  { key: "sugar_g_100g", perServe: "sugar_g", label: "  of which sugars", unit: "g" },
  { key: "added_sugar_g_100g", perServe: "added_sugar_g", label: "  added sugar", unit: "g" },
  { key: "fiber_g_100g", perServe: "fiber_g", label: "Fiber", unit: "g" },
  { key: "sodium_mg_100g", perServe: "sodium_mg", label: "Sodium", unit: "mg" },
  { key: "calcium_mg_100g", perServe: "calcium_mg", label: "Calcium", unit: "mg" },
  { key: "iron_mg_100g", perServe: "iron_mg", label: "Iron", unit: "mg" },
];

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "0";
  if (v < 0.1) return v.toFixed(2).replace(/\.?0+$/, "");
  if (v < 10) return v.toFixed(1).replace(/\.0$/, "");
  return Math.round(v).toString();
}

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
  const perServe = useMemo(() => perServeFromNutrition(nutrition), [nutrition]);
  const packGrams = useMemo(() => parsePackGrams(netWeight), [netWeight]);
  const packLabel = formatPackLabel(netWeight, packGrams);
  const hasServe = perServe?.serving_g != null && perServe.serving_g > 0;
  const serveG = perServe?.serving_g ?? null;
  const hasPack = packGrams != null && packGrams > 0;

  const ctx: NutritionContext | null = name ? { name, category, subcategory } : null;
  const anomalies = ctx ? detectNutritionAnomalies(nutrition, ctx) : [];
  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");

  function perServeValue(field: string): number | undefined {
    if (!perServe) return undefined;
    const v = perServe[field as keyof typeof perServe];
    return typeof v === "number" ? v : undefined;
  }

  function perPackValue(per100: number | null | undefined): number | undefined {
    if (per100 == null || !hasPack || packGrams == null) return undefined;
    return scaleFromPer100g(per100, packGrams);
  }

  const rows = ROWS.filter((r) => {
    const has100 = nutrition[r.key] != null;
    const hasServeVal = perServeValue(r.perServe) != null;
    const hasPackVal = perPackValue(nutrition[r.key] as number | undefined) != null;
    return has100 || hasServeVal || hasPackVal;
  });

  if (!rows.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">No nutrition values on file yet.</p>
    );
  }

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

      <div className="overflow-hidden rounded-2xl border border-(--color-line)">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-(--color-line) bg-(--color-bg-soft) text-[10px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
              <th className="px-4 py-3 text-left font-medium">Nutrient</th>
              <th className="px-3 py-3 text-right font-medium tabular-nums">Per 100g</th>
              <th className="px-3 py-3 text-right font-medium tabular-nums">
                {hasServe && serveG ? `Per serve (${serveG}g)` : "Per serve"}
              </th>
              {hasPack ? (
                <th className="px-3 py-3 text-right font-medium tabular-nums">
                  Whole pack ({packLabel})
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, perServe: psKey, label, unit, emphasis }) => {
              const per100 = nutrition[key] as number | undefined;
              const ps = perServeValue(psKey);
              const pack = perPackValue(per100);
              return (
                <tr key={key} className="border-b border-(--color-line)/60 last:border-0">
                  <td
                    className={
                      emphasis
                        ? "px-4 py-2.5 text-(--color-fg)"
                        : "px-4 py-2 pl-7 text-[12px] text-(--color-fg-muted)"
                    }
                  >
                    {label}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-(--color-fg-muted)">
                    {fmt(per100)}
                    {per100 != null ? (
                      <span className="ml-0.5 text-[10px] text-(--color-fg-dim)">{unit}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-(--color-fg)">
                    {hasServe ? (
                      <>
                        {fmt(ps)}
                        {ps != null ? (
                          <span className="ml-0.5 text-[10px] text-(--color-fg-dim)">{unit}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-(--color-fg-dim)">—</span>
                    )}
                  </td>
                  {hasPack ? (
                    <td className="px-3 py-2.5 text-right tabular-nums text-(--color-fg)">
                      {fmt(pack)}
                      {pack != null ? (
                        <span className="ml-0.5 text-[10px] text-(--color-fg-dim)">{unit}</span>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!hasServe && !hasPack ? (
          <p className="border-t border-(--color-line) px-4 py-2 text-[11px] text-(--color-fg-dim)">
            Serving size and pack weight not on file — only per 100g shown
          </p>
        ) : !hasServe ? (
          <p className="border-t border-(--color-line) px-4 py-2 text-[11px] text-(--color-fg-dim)">
            Serving size not on file — per-serve column empty where unknown
          </p>
        ) : null}
      </div>
    </div>
  );
}
