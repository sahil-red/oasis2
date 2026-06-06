/**
 * L3 online intent — Groq fast model, DeepSeek escalation (§6, §9).
 */
import { deepseekChat } from "@/lib/search/deepseek-client";
import { groqChat, parseGroqJson } from "@/lib/search/v2/groq-client";
import {
  countActiveConstraints,
  extractNumericConstraints,
  type NumericExtraction,
} from "@/lib/search/v2/numeric-constraints";
import type { ConstraintPriority, SearchIntentKind, SearchIntentV2, TraitId } from "@/lib/search/v2/types";
import { TRAIT_IDS } from "@/lib/search/v2/types";

const INTENT_SYSTEM_PROMPT = `You parse Indian grocery search queries into strict JSON for Scout Search.
Return exactly one JSON object. No markdown.

Schema:
{
  "kind": "directed"|"goal"|"brand"|"ambiguous",
  "goal_phrase": string|null,
  "brand": string|null,
  "primary_type": string|null,
  "use_case": string|null,
  "required_flavours": string[],
  "modifiers": string[],
  "constraints": {
    "max_price"?: number,
    "max_sugar_g"?: number,
    "max_fat_g"?: number,
    "min_protein_g"?: number,
    "vegan"?: boolean,
    "vegetarian"?: boolean,
    "gluten_free"?: boolean,
    "palm_oil_free"?: boolean,
    "avoid_ingredients"?: string[],
    "allergens_excluded"?: string[]
  },
  "constraint_priorities": [{"field": string, "priority": number}],
  "sort": "best_match"|"cheapest"|"healthiest"|"highest_protein"|"lowest_sugar",
  "comparison_ref": string|null,
  "comparison_mode": "healthier_than"|"cheaper_than"|null,
  "intent_confidence": number,
  "explanation": string
}

Rules:
- Understand Hindi/Hinglish natively (doodh, bina cheeni, nahi).
- "chocolate milk" vs "milk chocolate" are opposite primary_types — use product meaning, not word order rules.
- Goal/vague queries (healthy drinks for running, tiffin not junk) → kind:"goal" with goal_phrase.
- Use-case queries (pre-workout snack, school lunch) → kind:"directed" or "goal" with use_case slug (pre_workout, school_lunch).
- Type + health context (biscuits for diabetics) → kind:"directed", rank by diabetic traits.
- "high protein milk" → primary_type:"milk", sort:"highest_protein", do NOT set min_protein_g.
- constraint_priorities: lower number = relax first (price before sugar before avoid_ingredients).
- modifiers may include: high_protein_tier, low_sugar, no_added_sugar when user asks relatively.
- Populate avoid_ingredients/allergens from negation in the query.
- "healthier than maggi" → comparison_ref:"maggi", comparison_mode:"healthier_than", sort:"healthiest".
- "cheaper than amul butter" → comparison_ref:"amul butter", comparison_mode:"cheaper_than", sort:"cheapest".
`;

type LlmIntentJson = {
  kind?: SearchIntentKind;
  goal_phrase?: string | null;
  brand?: string | null;
  primary_type?: string | null;
  use_case?: string | null;
  required_flavours?: string[];
  modifiers?: string[];
  constraints?: SearchIntentV2["constraints"];
  constraint_priorities?: ConstraintPriority[];
  sort?: SearchIntentV2["sort"];
  comparison_ref?: string | null;
  comparison_mode?: SearchIntentV2["comparison_mode"];
  intent_confidence?: number;
};

function mergeNumericIntoIntent(
  base: SearchIntentV2,
  numeric: NumericExtraction,
): SearchIntentV2 {
  const constraints = { ...base.constraints };
  if (numeric.max_price != null) constraints.max_price = numeric.max_price;
  if (numeric.max_sugar_g != null) constraints.max_sugar_g = numeric.max_sugar_g;
  if (numeric.max_fat_g != null) constraints.max_fat_g = numeric.max_fat_g;
  if (numeric.min_protein_g != null && !base.primary_type) {
    constraints.min_protein_g = numeric.min_protein_g;
  }

  const modifiers = [...base.modifiers];
  if (numeric.high_protein_tier && !modifiers.includes("high_protein_tier")) {
    modifiers.push("high_protein_tier");
  }
  if (numeric.low_sugar_tier && !modifiers.includes("low_sugar")) modifiers.push("low_sugar");
  if (numeric.no_added_sugar && !modifiers.includes("no_added_sugar")) {
    modifiers.push("no_added_sugar");
  }

  return {
    ...base,
    constraints,
    modifiers,
    sort: numeric.sort !== "best_match" ? numeric.sort : base.sort,
  };
}

function normalizeLlmIntent(raw: LlmIntentJson, query: string): SearchIntentV2 {
  const constraints = {
    avoid_ingredients: raw.constraints?.avoid_ingredients ?? [],
    allergens_excluded: raw.constraints?.allergens_excluded ?? [],
    max_price: raw.constraints?.max_price,
    max_sugar_g: raw.constraints?.max_sugar_g,
    max_fat_g: raw.constraints?.max_fat_g,
    min_protein_g: raw.constraints?.min_protein_g,
    vegan: raw.constraints?.vegan,
    vegetarian: raw.constraints?.vegetarian,
    gluten_free: raw.constraints?.gluten_free,
    palm_oil_free: raw.constraints?.palm_oil_free,
  };

  const kind: SearchIntentKind =
    raw.kind === "goal" || raw.kind === "brand" || raw.kind === "ambiguous"
      ? raw.kind
      : "directed";

  return {
    kind,
    goal_phrase: kind === "goal" ? (raw.goal_phrase?.trim() || null) : null,
    goal_id: null,
    brand: raw.brand?.trim() || null,
    primary_type: raw.primary_type?.trim().toLowerCase() || null,
    use_case: raw.use_case?.trim().toLowerCase().replace(/[\s-]+/g, "_") || null,
    required_flavours: (raw.required_flavours ?? []).map((f) => f.toLowerCase()),
    modifiers: raw.modifiers ?? [],
    constraints,
    constraint_priorities: raw.constraint_priorities ?? defaultConstraintPriorities(constraints),
    sort: raw.sort ?? "best_match",
    comparison_ref: raw.comparison_ref?.trim() || null,
    comparison_mode: raw.comparison_mode ?? null,
    confidence: Math.max(0, Math.min(1, raw.intent_confidence ?? 0.7)),
    intent_source: "llm-groq",
    raw_query: query,
  };
}

function defaultConstraintPriorities(
  c: SearchIntentV2["constraints"],
): ConstraintPriority[] {
  const out: ConstraintPriority[] = [];
  let p = 1;
  if (c.avoid_ingredients.length) out.push({ field: "avoid_ingredients", priority: p++ });
  if (c.min_protein_g != null) out.push({ field: "min_protein_g", priority: p++ });
  if (c.max_sugar_g != null) out.push({ field: "max_sugar_g", priority: p++ });
  if (c.max_fat_g != null) out.push({ field: "max_fat_g", priority: p++ });
  if (c.max_price != null) out.push({ field: "max_price", priority: p++ });
  return out;
}

export async function parseIntentWithLlm(
  query: string,
  opts: { escalateDeepseek?: boolean } = {},
): Promise<{ intent: SearchIntentV2; llm_calls: number }> {
  const numeric = extractNumericConstraints(query);
  const constraintCount = countActiveConstraints(numeric);
  const useDeepseek =
    opts.escalateDeepseek || constraintCount >= 2;

  let llm_calls = 0;
  let intent: SearchIntentV2;

  if (useDeepseek) {
    const { content } = await deepseekChat({
      usageKind: "search",
      jsonObject: true,
      maxTokens: 1000,
      timeoutMs: 20_000,
      system: INTENT_SYSTEM_PROMPT,
      user: `Query: ${query}`,
    });
    llm_calls += 1;
    intent = normalizeLlmIntent(parseGroqJson<LlmIntentJson>(content), query);
    intent.intent_source = "llm-deepseek";
  } else {
    const { content } = await groqChat({
      system: INTENT_SYSTEM_PROMPT,
      user: `Query: ${query}`,
    });
    llm_calls += 1;
    intent = normalizeLlmIntent(parseGroqJson<LlmIntentJson>(content), query);
  }

  intent = mergeNumericIntoIntent(intent, numeric);
  if (!intent.comparison_ref && numeric.comparison_ref) {
    intent = {
      ...intent,
      comparison_ref: numeric.comparison_ref,
      comparison_mode: numeric.comparison_mode ?? null,
    };
  }
  if (intent.confidence < 0.6 && !useDeepseek) {
    const escalated = await parseIntentWithLlm(query, { escalateDeepseek: true });
    return { intent: escalated.intent, llm_calls: llm_calls + escalated.llm_calls };
  }

  return { intent, llm_calls };
}

/** §11 relaxation: LLM proposes next-broader intent */
export async function relaxIntentWithLlm(
  intent: SearchIntentV2,
  opts: { type_neighbors?: string[] } = {},
): Promise<{ intent: SearchIntentV2; explanation: string; llm_calls: number }> {
  const sorted = [...intent.constraint_priorities].sort((a, b) => a.priority - b.priority);
  const next = sorted[0]?.field;

  const { content } = await groqChat({
    system: `You broaden a grocery search intent when results are sparse. Never change primary_type or required_flavours. Return JSON: {"intent":{...same schema as parse...},"explanation":string}`,
    user: JSON.stringify({
      current_intent: intent,
      relax_field: next ?? "modifiers",
      embedding_neighbor_types: opts.type_neighbors ?? [],
    }),
    maxTokens: 800,
  });

  const parsed = parseGroqJson<{ intent?: LlmIntentJson; explanation?: string }>(content);
  const relaxed = normalizeLlmIntent(parsed.intent ?? {}, intent.raw_query);
  relaxed.intent_source = intent.intent_source;

  return {
    intent: {
      ...relaxed,
      primary_type: intent.primary_type,
      required_flavours: intent.required_flavours,
      goal_phrase: intent.goal_phrase,
      kind: intent.kind,
    },
    explanation: parsed.explanation ?? `Relaxed ${next ?? "constraints"}`,
    llm_calls: 1,
  };
}

export function validateTraitWeights(weights: Record<string, number>): Partial<Record<TraitId, number>> {
  const out: Partial<Record<TraitId, number>> = {};
  let sum = 0;
  for (const id of TRAIT_IDS) {
    const w = weights[id];
    if (typeof w === "number" && w > 0) {
      out[id] = w;
      sum += w;
    }
  }
  if (sum <= 0) return out;
  for (const id of Object.keys(out) as TraitId[]) {
    out[id] = (out[id] ?? 0) / sum;
  }
  return out;
}
