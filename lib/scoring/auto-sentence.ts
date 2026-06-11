import { sublabelChipLabels } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";
import { formatDeepseekChip } from "@/lib/ocr/deepseek-promote";

function dedupeReasons(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

const VERDICT_SUFFIX: Record<VerdictId, string> = {
  daily_staple: "strong regular buy",
  good_choice: "a good pick for this aisle",
  occasional_treat: "fine occasionally, not daily",
  skip: "not worth it",
};

export function buildAutoSentence(
  verdict: VerdictId,
  sublabelIds?: string[] | null,
  deepseekChips?: string[] | null,
): string {
  const topReasons = dedupeReasons([
    ...sublabelChipLabels(sublabelIds),
    ...(deepseekChips ?? []).map(formatDeepseekChip),
  ]).slice(0, 3);
  const suffix = VERDICT_SUFFIX[verdict];
  return topReasons.length
    ? `${topReasons.slice(0, 2).join(", ")} — ${suffix}.`
    : `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}.`;
}
