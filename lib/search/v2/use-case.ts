import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

function normalizeUseCase(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** §14 use-case queries — match LLM-extracted use_cases tags (0–1). */
export function useCaseMatchScore(row: ProductSearchIndexRow, useCase: string | null | undefined): number {
  if (!useCase?.trim()) return 0;
  const needle = normalizeUseCase(useCase);
  if (!needle) return 0;

  for (const raw of row.use_cases) {
    const tag = normalizeUseCase(raw);
    if (!tag) continue;
    if (tag === needle || tag.includes(needle) || needle.includes(tag)) return 1;
  }
  return 0;
}
