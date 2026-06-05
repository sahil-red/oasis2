import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

/** Declared on pack — highest-confidence signal. */
const ARTIFICIAL_ON_LABEL =
  /\b(artificial flavour|artificial flavor|artificial colour|artificial color|artificial flavouring|artificial flavoring)\b/i;

/** Whole spices / aromatics — LLM often tags role=flavor; never treat as artificial alone. */
const WHOLE_SPICE_OR_AROMATIC =
  /\b(cumin|coriander|ginger|turmeric|chilli|chili|pepper|cardamom|clove|cinnamon|nutmeg|mace|asafoetida|hing|fenugreek|mustard|fennel|ajwain|bay leaf|star anise|green chilli|black pepper|masala)\b/i;

function rowBlob(r: IngredientIntelligenceRow): string {
  return [
    r.normalized_name,
    r.display_name ?? "",
    ...(r.concern_reasons ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * True when label text or LLM ingredient intelligence explicitly indicates artificial
 * flavoring/colouring — not when spices happen to have role=flavor.
 */
export function hasArtificialFlavorsFromIntelligence(
  ingredients_raw: string | null,
  rows: IngredientIntelligenceRow[],
): boolean {
  const ing = ingredients_raw ?? "";
  if (ARTIFICIAL_ON_LABEL.test(ing)) return true;

  for (const r of rows) {
    const blob = rowBlob(r);
    if (!blob.trim()) continue;

    if (/\bnatural\s+flavou?ring\b/i.test(blob) && !/\bartificial\b/i.test(blob)) {
      continue;
    }

    if (/\bartificial\s+(flavou?r|colo?u?r|flavou?ring|flavoring)\b/i.test(blob)) {
      return true;
    }

    if (
      r.concern_reasons.some(
        (reason) =>
          /\b(artificial|synthetic)\b/i.test(reason) &&
          /\b(flavou?r|colo?u?r|chemical|flavoring|flavouring)\b/i.test(reason),
      )
    ) {
      return true;
    }

    if (
      r.concern_reasons.some((reason) =>
        /\b(may contain (harmful )?synthetic|synthetic chemicals?)\b/i.test(reason),
      ) &&
      /\bflavou?r/i.test(blob)
    ) {
      return true;
    }

    // Do not infer from role=flavor or empty concern_reasons on whole spices.
    if (WHOLE_SPICE_OR_AROMATIC.test(r.normalized_name) && !/\bartificial\b/i.test(blob)) {
      continue;
    }
  }

  return false;
}
