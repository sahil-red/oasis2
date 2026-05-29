import {
  formatNutrientValue,
  resolveNutritionDisplay,
  type ResolvedNutritionRow,
} from "@/lib/nutrition/nutrition-display";
import type { ProductNutrition } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

function ValueCell({
  value,
  unit,
  muted,
}: {
  value: number | undefined;
  unit: string;
  muted?: boolean;
}) {
  const text = formatNutrientValue(value);
  const showUnit = value != null;
  return (
    <span className={cn("tabular-nums", muted ? "text-(--color-fg-muted)" : "text-(--color-fg)")}>
      {text}
      {showUnit ? (
        <span className="ml-0.5 text-[10px] font-normal text-(--color-fg-dim)">{unit}</span>
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
  return (
    <tr className="border-b border-(--color-line)/50 last:border-0">
      <td
        className={cn(
          "py-2 pr-2 align-middle",
          row.indent ? "pl-6 text-[11px] text-(--color-fg-muted)" : "pl-3",
          row.emphasis && !row.indent && "font-medium text-(--color-fg)",
        )}
      >
        {row.indent ? (
          <span className="flex items-center gap-1.5">
            <span className="text-(--color-fg-dim)" aria-hidden>
              ↳
            </span>
            {row.label}
          </span>
        ) : (
          row.label
        )}
      </td>
      <td className="px-2 py-2 text-right align-middle">
        <ValueCell value={row.per100} unit={row.unit} muted />
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
