"use client";

import { useMemo, useState } from "react";
import { roundNutrient } from "@/lib/products/pack-nutrition";
import { perServeFromNutrition } from "@/lib/scoring/per-serve";
import { detectNutritionAnomalies, type NutritionContext } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

const ROWS: {
  key: keyof ProductNutrition;
  perServe: string;
  label: string;
  unit: string;
}[] = [
  { key: "energy_kcal_100g", perServe: "energy_kcal", label: "Energy", unit: "kcal" },
  { key: "protein_g_100g", perServe: "protein_g", label: "Protein", unit: "g" },
  { key: "fat_g_100g", perServe: "fat_g", label: "Fat", unit: "g" },
  { key: "saturated_fat_g_100g", perServe: "saturated_fat_g", label: "Saturated fat", unit: "g" },
  { key: "trans_fat_g_100g", perServe: "trans_fat_g", label: "Trans fat", unit: "g" },
  { key: "carbs_g_100g", perServe: "carbs_g", label: "Carbohydrates", unit: "g" },
  { key: "sugar_g_100g", perServe: "sugar_g", label: "Sugar", unit: "g" },
  { key: "added_sugar_g_100g", perServe: "added_sugar_g", label: "Added sugar", unit: "g" },
  { key: "fiber_g_100g", perServe: "fiber_g", label: "Fiber", unit: "g" },
  { key: "sodium_mg_100g", perServe: "sodium_mg", label: "Sodium", unit: "mg" },
];

type Basis = "serve" | "100g";

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
  const hasServe = perServe?.serving_g != null && perServe.serving_g > 0;
  const serveG = perServe?.serving_g ?? null;

  const [basis, setBasis] = useState<Basis>(hasServe ? "serve" : "100g");

  const ctx: NutritionContext | null = name
    ? { name, category, subcategory }
    : null;
  const anomalies = ctx ? detectNutritionAnomalies(nutrition, ctx) : [];
  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");


  function perServeValue(field: string): number | undefined {
    if (!perServe) return undefined;
    const v = perServe[field as keyof typeof perServe];
    return typeof v === "number" ? v : undefined;
  }

  const rows = ROWS.filter((r) => {
    if (basis === "serve" && hasServe) return perServeValue(r.perServe) != null;
    return nutrition[r.key] != null;
  });

  if (!rows.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">No nutrition values on file yet.</p>
    );
  }

  const colLabel =
    basis === "serve" && serveG ? `Per serving (${serveG}g)` : "Per 100g";

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <BasisButton
          active={basis === "serve"}
          disabled={!hasServe}
          title={
            hasServe
              ? undefined
              : "Serving size not available for this product"
          }
          onClick={() => hasServe && setBasis("serve")}
        >
          Per serve
        </BasisButton>
        <BasisButton active={basis === "100g"} onClick={() => setBasis("100g")}>
          Per 100g
        </BasisButton>
      </div>
      {!hasServe ? (
        <p className="mb-3 mt-1.5 text-[11px] leading-snug text-(--color-fg-dim)">
          Serving size unavailable — values shown per 100g
        </p>
      ) : (
        <div className="mb-3" />
      )}

      {critical.length > 0 ? (
        <div className="mb-3 rounded-lg border border-red-200/90 bg-red-50/70 px-3 py-2.5 text-[13px] leading-snug text-red-950">
          <p className="font-medium">Nutrition data looks wrong</p>
          <ul className="mt-1 list-inside list-disc text-red-900/90">
            {critical.map((a) => (
              <li key={a.code}>{a.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
              <th className="px-4 py-3 font-normal text-right">{colLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, perServe, label, unit }) => {
              let value: number | null = null;
              if (basis === "serve" && hasServe) {
                value = perServeValue(perServe) ?? null;
              } else {
                value = nutrition[key] as number;
              }
              return (
                <tr key={key} className="border-b border-(--color-line) last:border-0">
                  <td className="px-4 py-2.5 text-(--color-fg-muted)">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-(--color-fg)">
                    {value} {unit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {basis === "serve" ? (
          <p className="border-t border-(--color-line) px-4 py-2 text-xs text-(--color-fg-dim)">
            Serving size from label OCR or category default — used for V9 scoring.
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

function BasisButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        active
          ? "rounded-full border border-(--color-accent) bg-(--color-accent)/10 px-3 py-1 text-xs font-medium text-(--color-accent)"
          : disabled
            ? "cursor-not-allowed rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-fg-dim) opacity-40"
            : "rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-fg-muted) hover:border-(--color-fg-dim)"
      }
    >
      {children}
    </button>
  );
}
