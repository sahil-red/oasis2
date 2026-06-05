import type { Router } from "expo-router";
import type { LandingFactAction } from "@/types/api";

export function runLandingAction(router: Router, action: LandingFactAction) {
  if (action.type === "ai_search" && action.prompt) {
    router.push({ pathname: "/search", params: { q: action.prompt } });
    return;
  }
  if (action.type === "catalog") {
    const params: Record<string, string> = {};
    if (action.verdict) params.verdict = action.verdict;
    if (action.sublabel) params.sublabel = action.sublabel;
    if (action.sort) params.sort = action.sort;
    router.push({ pathname: "/(tabs)/browse", params });
    return;
  }
  if (action.type === "expose" && action.slugs[0]) {
    router.push(`/product/${action.slugs[0]}`);
  }
}
