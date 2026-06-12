/**
 * Python intent classifier client — replaces LLM intent resolution.
 *
 * Calls the Scout Intent Classifier microservice (FastAPI + rule-based/fastText).
 * Falls back silently to null on any error — caller (resolveSearchIntent) chains
 * to the existing LLM path as a safety net.
 *
 * Service URL is configured via PYTHON_INTENT_SERVICE_URL env var.
 * If unset, the classifier is disabled (returns null immediately).
 */

import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { ConstraintPriority, SearchIntentKind, SearchIntentV2 } from "@/lib/search/v2/types";

type PythonIntentRaw = {
  kind?: string;
  brand?: string | null;
  primary_type?: string | null;
  required_flavours?: string[];
  goal_phrase?: string | null;
  use_case?: string | null;
  modifiers?: string[];
  sort?: string;
  confidence?: number;
  trait_weights?: Record<string, number>;
};

function normalizePythonIntent(raw: PythonIntentRaw, query: string): SearchIntentV2 {
  const validKinds: SearchIntentKind[] = ["directed", "goal", "brand", "ambiguous"];
  const kind: SearchIntentKind = validKinds.includes(raw.kind as SearchIntentKind)
    ? (raw.kind as SearchIntentKind)
    : "ambiguous";

  const validSorts = ["best_match", "cheapest", "healthiest", "highest_protein", "lowest_sugar"] as const;
  const sort = validSorts.includes(raw.sort as typeof validSorts[number])
    ? (raw.sort as SearchIntentV2["sort"])
    : "best_match";

  return {
    kind,
    goal_phrase: raw.goal_phrase?.trim() || null,
    goal_id: null,
    brand: raw.brand?.trim() || null,
    primary_type: raw.primary_type?.trim().toLowerCase() || null,
    use_case: raw.use_case?.trim().toLowerCase().replace(/[\s-]+/g, "_") || null,
    required_flavours: (raw.required_flavours ?? []).map((f) => f.toLowerCase()),
    modifiers: raw.modifiers ?? [],
    constraints: {
      avoid_ingredients: [],
      allergens_excluded: [],
    },
    constraint_priorities: [] as ConstraintPriority[],
    sort,
    comparison_ref: null,
    comparison_mode: null,
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.7)),
    intent_source: "python-classifier",
    raw_query: query,
    trait_weights: raw.trait_weights ?? {},
  };
}

const DEFAULT_TRIES = 2;

export async function classifyIntentWithPython(
  query: string,
  meta: IndexCatalogMeta,
  tries = DEFAULT_TRIES,
): Promise<SearchIntentV2 | null> {
  const serviceUrl = process.env.PYTHON_INTENT_SERVICE_URL?.trim();
  if (!serviceUrl) return null;

  const brands = [...meta.brands].slice(0, 800); // limit payload size
  const primaryTypes = [...meta.primaryTypes].slice(0, 500);

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(`${serviceUrl}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, brands, primary_types: primaryTypes }),
        signal: AbortSignal.timeout(attempt === 1 ? 800 : 1200),
      });

      if (!res.ok) {
        if (attempt < tries) continue;
        return null;
      }

      const raw = (await res.json()) as PythonIntentRaw;
      return normalizePythonIntent(raw, query);
    } catch {
      if (attempt >= tries) return null;
    }
  }

  return null;
}
