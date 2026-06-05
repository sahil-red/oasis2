/** Live search vs batch label extraction — separate keys when configured. */

export type DeepseekUsageKind = "search" | "label";

export function resolveDeepseekApiKey(kind: DeepseekUsageKind = "search"): string | undefined {
  if (kind === "search") {
    return process.env.DEEPSEEK_SEARCH_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  }
  return process.env.DEEPSEEK_LABEL_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
}
