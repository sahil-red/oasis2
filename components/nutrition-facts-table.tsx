import {
  formatNutrientValue,
  resolveNutritionDisplay,
  type ResolvedNutritionRow,
} from "@/lib/nutrition/nutrition-display";
import type { ProductNutrition } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type NutritionTone = {
  kind: "positive" | "watch" | "limit";
  label: string;
  title: string;
};

const TONE_COLOR: Record<NutritionTone["kind"], string> = {
  positive: "var(--score-excellent)",
  watch: "var(--score-poor)",
  limit: "var(--score-bad)",
};

function nutritionTone(row: ResolvedNutritionRow): NutritionTone | null {
  const v = row.per100;
  if (v == null) return null;

  switch (row.id) {
    case "energy_kcal_100g":
      if (v >= 550) return { kind: "limit", label: "high", title: "High calorie density per 100g." };
      if (v >= 400) return { kind: "watch", label: "watch", title: "Moderately calorie dense per 100g." };
      return null;
    case "sugar_g_100g":
      if (v >= 22.5) return { kind: "limit", label: "high", title: "High sugar: 22.5g+ per 100g." };
      if (v >= 10) return { kind: "watch", label: "watch", title: "Moderate sugar: 10g+ per 100g." };
      if (v <= 5) return { kind: "positive", label: "low", title: "Low sugar: 5g or less per 100g." };
      return null;
    case "added_sugar_g_100g":
      if (v >= 10) return { kind: "limit", label: "high", title: "High added sugar per 100g." };
      if (v > 0) return { kind: "watch", label: "added", title: "Contains added sugar." };
      return { kind: "positive", label: "none", title: "No added sugar on the label." };
    case "saturated_fat_g_100g":
      if (v >= 10) return { kind: "limit", label: "high", title: "High saturated fat: 10g+ per 100g." };
      if (v >= 5) return { kind: "watch", label: "watch", title: "Moderate saturated fat: 5g+ per 100g." };
      return null;
    case "trans_fat_g_100g":
      if (v > 0.2) return { kind: "limit", label: "avoid", title: "Trans fat is present." };
      if (v === 0) return { kind: "positive", label: "zero", title: "Zero trans fat on the label." };
      return null;
    case "sodium_mg_100g":
      if (v >= 800) return { kind: "limit", label: "high", title: "High sodium: 800mg+ per 100g." };
      if (v >= 400) return { kind: "watch", label: "watch", title: "Moderate sodium: 400mg+ per 100g." };
      return null;
    case "fat_g_100g":
      if (v >= 25) return { kind: "limit", label: "high", title: "High total fat per 100g." };
      if (v >= 17.5) return { kind: "watch", label: "watch", title: "Moderate total fat per 100g." };
      return null;
    case "protein_g_100g":
      if (v >= 15) return { kind: "positive", label: "high", title: "High protein per 100g." };
      if (v >= 8) return { kind: "positive", label: "good", title: "Meaningful protein per 100g." };
      return null;
    case "fiber_g_100g":
      if (v >= 6) return { kind: "positive", label: "high", title: "High fibre per 100g." };
      if (v >= 3) return { kind: "positive", label: "source", title: "Source of fibre per 100g." };
      return null;
    case "calcium_mg_100g":
      if (v >= 120) return { kind: "positive", label: "source", title: "Source of calcium per 100g." };
      return null;
    case "iron_mg_100g":
      if (v >= 2) return { kind: "positive", label: "source", title: "Source of iron per 100g." };
      return null;
    default:
      return null;
  }
}

function ValueCell({
  value,
  unit,
  muted,
  tone,
}: {
  value: number | undefined;
  unit: string;
  muted?: boolean;
  tone?: NutritionTone | null;
}) {
  const text = formatNutrientValue(value);
  const showUnit = value != null;
  const color = tone ? TONE_COLOR[tone.kind] : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-baseline rounded-md px-1.5 py-0.5 tabular-nums",
        !tone && (muted ? "text-(--color-fg-muted)" : "text-(--color-fg)"),
      )}
      style={
        tone
          ? {
              color,
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
            }
          : undefined
      }
      title={tone?.title}
    >
      {text}
      {showUnit ? (
        <span className="ml-0.5 text-[10px] font-normal opacity-75">{unit}</span>
      ) : null}
    </span>
  );
}

function NutritionRow({
  row,
  hasServe,
  hasPack,
}: {
  row: ResolvedNutritionRow;
  hasServe: boolean;
  hasPack: boolean;
}) {
  const tone = nutritionTone(row);
  const toneColor = tone ? TONE_COLOR[tone.kind] : undefined;
  return (
    <tr className="border-b border-(--color-line)/50 last:border-0">
      <td
        className={cn(
          "py-2 pr-2 align-middle",
          row.indent ? "pl-6 text-[11px] text-(--color-fg-muted)" : "pl-3",
          row.emphasis && !row.indent && "font-medium text-(--color-fg)",
        )}
      >
        <span className="flex items-center gap-1.5">
          {row.indent ? (
            <span className="text-(--color-fg-dim)" aria-hidden>
              ↳
            </span>
          ) : null}
          <span>{row.label}</span>
          {tone ? (
            <span
              className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{
                color: toneColor,
                borderColor: `color-mix(in srgb, ${toneColor} 45%, var(--color-line))`,
                backgroundColor: `color-mix(in srgb, ${toneColor} 10%, transparent)`,
              }}
              title={tone.title}
            >
              {tone.label}
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-2 py-2 text-right align-middle">
        <ValueCell value={row.per100} unit={row.unit} muted tone={tone} />
      </td>
      {hasServe ? (
        <td className="px-2 py-2 text-right align-middle">
          <ValueCell value={row.perServe} unit={row.unit} />
        </td>
      ) : null}
      {hasPack ? (
        <td className="px-2 py-2 text-right align-middle">
          <ValueCell value={row.perPack} unit={row.unit} />
        </td>
      ) : null}
    </tr>
  );
}

export function NutritionFactsTable({
  nutrition,
  netWeight,
  className,
}: {
  nutrition: ProductNutrition;
  netWeight?: string | null;
  className?: string;
}) {
  const { rows, hasServe, serveG, hasPack, packLabel } = resolveNutritionDisplay(
    nutrition,
    netWeight,
  );

  if (!rows.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">No nutrition values on file yet.</p>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-(--color-line)", className)}>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-(--color-line) bg-(--color-bg-soft) text-[10px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
            <th className="px-3 py-2.5 text-left font-medium">Nutrient</th>
            <th className="px-2 py-2.5 text-right font-medium tabular-nums">Per 100g</th>
            {hasServe ? (
              <th className="px-2 py-2.5 text-right font-medium tabular-nums">
                {serveG ? `Per serve (${serveG}g)` : "Per serve"}
              </th>
            ) : null}
            {hasPack ? (
              <th className="px-2 py-2.5 text-right font-medium tabular-nums">
                Whole pack ({packLabel})
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <NutritionRow key={row.id} row={row} hasServe={hasServe} hasPack={hasPack} />
          ))}
        </tbody>
      </table>
      {!hasServe && !hasPack ? (
        <p className="border-t border-(--color-line) px-3 py-2 text-[11px] leading-snug text-(--color-fg-dim)">
          Serving size and pack weight not on file — per 100g only.
        </p>
      ) : !hasServe ? (
        <p className="border-t border-(--color-line) px-3 py-2 text-[11px] leading-snug text-(--color-fg-dim)">
          Serving size not on file — per-serve column omitted.
        </p>
      ) : null}
    </div>
  );
}
