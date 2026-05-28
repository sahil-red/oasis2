import type { OcrCompareSummary } from "@/lib/ocr/compare-platform";
import type { LabelResolutionMeta } from "@/lib/products/label-resolution";

const NUTRITION_FIELD_LABELS: Record<string, string> = {
  energy_kcal_100g: "Energy",
  protein_g_100g: "Protein",
  fat_g_100g: "Fat",
  carbs_g_100g: "Carbohydrates",
  sugar_g_100g: "Sugar",
  fiber_g_100g: "Fiber",
  sodium_mg_100g: "Sodium",
};

function statusLine(status: string | undefined, source: string | undefined): string {
  if (status === "different") {
    return source === "llm"
      ? "Label read disagreed with Zepto CSV — LM value is shown on this page."
      : "Label read disagreed with Zepto CSV.";
  }
  if (status === "ocr_adds") return "Zepto CSV was empty; filled from pack image.";
  if (status === "existing_only") return "Zepto CSV kept (label read did not override).";
  if (status === "match") return "Matches Zepto CSV.";
  return "No comparison recorded.";
}

export function LabelChangeSummary({
  labelResolution,
}: {
  labelResolution: LabelResolutionMeta | null;
}) {
  const compare = labelResolution?.compare as OcrCompareSummary | undefined;
  if (!compare) return null;

  const nutChanged = compare.nutrition === "different";
  const ingChanged = compare.ingredients === "different";
  if (!nutChanged && !ingChanged) return null;

  const differing = compare.nutrition_detail?.differing_fields ?? [];
  const ingDetail = compare.ingredients_detail;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-200/60 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800/60">
      <p className="font-medium">Label pipeline vs Zepto CSV</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-[13px]">
        {nutChanged ? (
          <li>
            <span className="font-medium">Nutrition:</span>{" "}
            {statusLine(compare.nutrition, labelResolution?.nutrition_source ?? undefined)}
            {differing.length > 0 ? (
              <span className="block pl-5 text-amber-900/90 dark:text-amber-200/90">
                Macros that differed:{" "}
                {differing
                  .map((k) => NUTRITION_FIELD_LABELS[k] ?? k.replace(/_100g$/, ""))
                  .join(", ")}
                .
              </span>
            ) : null}
          </li>
        ) : null}
        {ingChanged ? (
          <li>
            <span className="font-medium">Ingredients:</span>{" "}
            {statusLine(compare.ingredients, labelResolution?.ingredients_source ?? undefined)}
            {ingDetail ? (
              <span className="block pl-5 text-amber-900/90 dark:text-amber-200/90">
                CSV list was {ingDetail.existing_len} chars; label read had{" "}
                {ingDetail.ocr_ingredient_count} ingredient segments
                {ingDetail.overlap_ratio != null
                  ? ` (${Math.round(ingDetail.overlap_ratio * 100)}% token overlap with CSV)`
                  : ""}
                . The ingredient block below is the post-pipeline value.
              </span>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
