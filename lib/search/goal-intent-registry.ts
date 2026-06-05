/**
 * Single registry for goal-aware search. To add a new shopper goal:
 * 1. Add GoalId + scoring in lib/goals (fit.ts, types.ts).
 * 2. Add one GOAL_INTENT_REGISTRY entry below (detect regex + flags).
 * Search parse, audience stripping, infant gates, and primary sort read from here.
 */
import type { GoalId } from "@/lib/goals/types";
import type { ParsedHealthContext, ParsedProductQuery, ParsedSortIntent } from "@/lib/search/query-parse";
import type { ProductListItem } from "@/lib/products/queries";

export type GoalIntentSpec = {
  /** Value stored on parsed.health_contexts */
  context: ParsedHealthContext;
  goalId: GoalId;
  /** Detect goal from normalized query text */
  detect: RegExp;
  /** Higher wins when multiple goals match */
  priority: number;
  /** Words that are audience/goal labels, never product types */
  audienceWords?: readonly string[];
  /** Goal-only or "protein for …" ranks by computeGoalFit, not raw g/100g alone */
  proteinViaGoalFit?: boolean;
  minProteinWhenGoalOnly?: number;
  proteinRetrievalKeywords?: readonly string[];
  blockInfantProducts?: boolean;
  defaultInfantExcludes?: boolean;
  /** When matched, switch to healthiest unless sort is cheapest / highest_protein */
  preferHealthiestWhen?: RegExp;
};

export const GOAL_INTENT_REGISTRY: GoalIntentSpec[] = [
  {
    context: "diabetic",
    goalId: "diabetic",
    detect: /\bdiabetic|diabetes\b/i,
    priority: 100,
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
  {
    context: "pcos",
    goalId: "pcos",
    detect: /\bpcos\b/i,
    priority: 95,
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
  {
    context: "kids",
    goalId: "kids",
    detect: /\b(kids|children|child)\b/i,
    priority: 90,
    preferHealthiestWhen: /\bhealthy|healthiest|tiffin|school|snack|nutritious|wholesome\b/i,
  },
  {
    context: "parents",
    goalId: "parents",
    detect: /\b(parents?|elderly|seniors?|for mom|for dad|grandparents?|old age)\b/i,
    priority: 88,
    audienceWords: [
      "parents",
      "parent",
      "elderly",
      "senior",
      "seniors",
      "mom",
      "dad",
      "mother",
      "father",
      "grandma",
      "grandpa",
      "grandparent",
    ],
    proteinViaGoalFit: true,
    minProteinWhenGoalOnly: 10,
    proteinRetrievalKeywords: [
      "protein",
      "paneer",
      "milk",
      "curd",
      "dal",
      "eggs",
      "whey",
      "horlicks",
      "ensure",
      "protinex",
      "oats",
    ],
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
  {
    context: "fat_loss",
    goalId: "fat-loss",
    detect: /\b(fat loss|weight loss|diet)\b/i,
    priority: 70,
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
  {
    context: "gym",
    goalId: "gym",
    detect: /\bgym\b/i,
    priority: 60,
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
  {
    context: "bulk",
    goalId: "bulk",
    detect: /\b(bulk|bulking|weight gain)\b/i,
    priority: 55,
    blockInfantProducts: true,
    defaultInfantExcludes: true,
  },
];

const REGISTRY_BY_CONTEXT = new Map(
  GOAL_INTENT_REGISTRY.map((e) => [e.context, e] as const),
);
const REGISTRY_BY_GOAL = new Map(GOAL_INTENT_REGISTRY.map((e) => [e.goalId, e] as const));
const PRIORITY_ORDER = [...GOAL_INTENT_REGISTRY].sort((a, b) => b.priority - a.priority);

export function goalIntentForContext(context: ParsedHealthContext): GoalIntentSpec | undefined {
  return REGISTRY_BY_CONTEXT.get(context);
}

export function goalIntentForGoalId(goalId: GoalId): GoalIntentSpec | undefined {
  return REGISTRY_BY_GOAL.get(goalId);
}

export function detectGoalContextsFromQuery(lower: string): ParsedHealthContext[] {
  const out: ParsedHealthContext[] = [];
  for (const entry of GOAL_INTENT_REGISTRY) {
    if (entry.detect.test(lower)) out.push(entry.context);
  }
  return out;
}

export function healthContextGoalId(contexts: ParsedHealthContext[]): GoalId | null {
  for (const entry of PRIORITY_ORDER) {
    if (contexts.includes(entry.context)) return entry.goalId;
  }
  return null;
}

export function healthContextsBlockingInfant(): ParsedHealthContext[] {
  return GOAL_INTENT_REGISTRY.filter((e) => e.blockInfantProducts).map((e) => e.context);
}

export function contextsWithDefaultInfantExcludes(): ParsedHealthContext[] {
  return GOAL_INTENT_REGISTRY.filter((e) => e.defaultInfantExcludes).map((e) => e.context);
}

const ALL_AUDIENCE_WORDS = new Set(
  GOAL_INTENT_REGISTRY.flatMap((e) => e.audienceWords ?? []).map((w) => w.toLowerCase()),
);

export function isAudienceMetaTerm(term: string): boolean {
  return ALL_AUDIENCE_WORDS.has(term.toLowerCase());
}

export function applyGoalIntentHeuristics(parsed: ParsedProductQuery, lower: string): void {
  for (const ctx of detectGoalContextsFromQuery(lower)) {
    if (!parsed.health_contexts.includes(ctx)) parsed.health_contexts.push(ctx);
  }

  if (
    (parsed.health_contexts.includes("diabetic") || parsed.health_contexts.includes("pcos")) &&
    parsed.sort_intent !== "cheapest" &&
    parsed.sort_intent !== "highest_protein"
  ) {
    parsed.sort_intent = "healthiest";
  }

  for (const entry of GOAL_INTENT_REGISTRY) {
    if (!parsed.health_contexts.includes(entry.context)) continue;
    if (
      entry.preferHealthiestWhen?.test(lower) &&
      parsed.sort_intent !== "cheapest" &&
      parsed.sort_intent !== "highest_protein"
    ) {
      parsed.sort_intent = "healthiest";
    }
  }

  for (const entry of GOAL_INTENT_REGISTRY) {
    if (!entry.audienceWords?.length || !entry.detect.test(lower)) continue;

    if (!parsed.health_contexts.includes(entry.context)) {
      parsed.health_contexts.push(entry.context);
    }

    const audienceSet = new Set(entry.audienceWords.map((w) => w.toLowerCase()));
    parsed.product_terms = parsed.product_terms.filter((t) => !audienceSet.has(t.toLowerCase()));
    parsed.search_keywords = parsed.search_keywords.filter((t) => !audienceSet.has(t.toLowerCase()));

    const label =
      entry.goalId === "parents"
        ? "for parents / elderly"
        : `for ${entry.goalId.replace("-", " ")}`;
    if (!parsed.soft_preferences.some((s) => s === label)) {
      parsed.soft_preferences.push(label);
    }
  }

  const proteinAsk = /\bprotein\b/i.test(lower);
  const namedProteinProduct = /\bprotein (powder|bar|shake|supplement)\b/i.test(lower);
  if (proteinAsk && !namedProteinProduct) {
    const onlyAudienceOrEmpty =
      parsed.product_terms.length === 0 ||
      parsed.product_terms.every((t) => isAudienceMetaTerm(t));
    const primary = healthContextGoalId(parsed.health_contexts);
    const spec = primary ? goalIntentForGoalId(primary) : undefined;

    if (onlyAudienceOrEmpty || spec?.proteinViaGoalFit) {
      if (!parsed.hard_constraints.min_protein_g_100g) {
        parsed.hard_constraints.min_protein_g_100g =
          spec?.minProteinWhenGoalOnly ?? (spec?.proteinViaGoalFit ? 10 : 12);
      }
      if (spec?.proteinViaGoalFit) {
        parsed.sort_intent = "best_match";
      } else if (parsed.sort_intent === "best_match") {
        parsed.sort_intent = "highest_protein";
      }
      if (spec?.proteinRetrievalKeywords?.length) {
        parsed.search_keywords = [
          ...new Set([...parsed.search_keywords, ...spec.proteinRetrievalKeywords]),
        ];
      } else if (onlyAudienceOrEmpty) {
        parsed.search_keywords = [
          ...new Set([...parsed.search_keywords, "protein", "paneer", "milk", "curd", "dal"]),
        ];
      }
      if (spec?.goalId === "parents") {
        parsed.explanation = "High-protein foods suited for parents / elderly.";
      } else if (onlyAudienceOrEmpty && primary) {
        const profile = goalIntentForGoalId(primary);
        parsed.explanation = `Foods in the catalog for your ${profile?.goalId ?? "goal"}.`;
      } else if (onlyAudienceOrEmpty) {
        parsed.explanation = "High-protein products in the catalog.";
      }
    }
  }
}

export function shouldSortPrimaryByGoalFit(parsed: ParsedProductQuery): boolean {
  const goalId = healthContextGoalId(parsed.health_contexts);
  if (!goalId) return false;
  if (parsed.sort_intent === "cheapest") return false;

  const spec = goalIntentForGoalId(goalId);
  const goalOnly = parsed.product_terms.length === 0;

  if (goalOnly) return true;
  if (parsed.sort_intent === "healthiest" || parsed.sort_intent === "best_match") return true;
  if (parsed.sort_intent === "highest_protein") return spec?.proteinViaGoalFit === true;
  return false;
}

function stapleBoostForParents(p: ProductListItem): number {
  const labelHay = `${p.name ?? ""} ${p.subcategory ?? ""} ${p.category ?? ""}`.toLowerCase();
  return /\b(dal|pulse|milk|curd|paneer|egg|oats|horlicks|ensure|protinex|ragi|sattu|buttermilk|lassi)\b/i.test(
    labelHay,
  )
    ? 1
    : 0;
}

export function goalSortTieBreakers(
  goalId: GoalId,
  p: ProductListItem,
  protein: number | null,
  sugar: number | null,
): number[] {
  switch (goalId) {
    case "parents": {
      const proteinVal = protein ?? -1;
      const adequate = proteinVal >= 8 && proteinVal <= 42 ? 1 : 0;
      return [stapleBoostForParents(p), adequate, Math.min(Math.max(proteinVal, 0), 42)];
    }
    case "diabetic":
    case "pcos":
    case "fat-loss":
      return [sugar != null ? -sugar : -999];
    case "gym":
    case "bulk":
      return [protein ?? -1];
    default:
      return [];
  }
}

export function resolveSortIntentForGoal(
  current: ParsedSortIntent,
  goalId: GoalId | null,
  goalOnly: boolean,
): ParsedSortIntent {
  if (!goalId || current === "cheapest") return current;
  if (goalOnly) return "best_match";
  const spec = goalIntentForGoalId(goalId);
  if (spec?.proteinViaGoalFit && current === "highest_protein") return "best_match";
  return current;
}
