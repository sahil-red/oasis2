import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { buildInsights, type InsightLists } from "@/lib/products/insights";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";

export type LandingPick = {
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  score: number | null;
  grade: string | null;
  verdict: string | null;
  price: number | null;
  meta: string | null;
};

export type LandingFact = {
  stat: string;
  headline: string;
  prompt: string;
  tone: "bad" | "good" | "neutral";
};

export type LandingGoalBoard = {
  goal: GoalId;
  label: string;
  tagline: string;
  picks: LandingPick[];
};

export type LandingPickOfDay = {
  pick: LandingPick;
  reasons: string[];
};

export type LandingInsights = {
  totalScored: number;
  avgScore: number;
  facts: LandingFact[];
  pickOfDay: LandingPickOfDay | null;
  goalBoards: LandingGoalBoard[];
};

function sugarOf(n: ProductNutrition | null | undefined): number | null {
  const s = n?.sugar_g_100g ?? n?.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

function toPick(p: ProductListItem, meta?: string | null): LandingPick {
  return {
    slug: p.slug,
    name: p.name,
    brand: p.brand ?? null,
    image: p.image_urls?.[0] ?? null,
    score: p.core_scores?.score ?? null,
    grade: p.core_scores?.grade ?? null,
    verdict: p.core_scores?.verdict ?? null,
    price: p.price_inr ?? null,
    meta: meta ?? null,
  };
}

function hasSublabel(p: ProductListItem, id: string): boolean {
  return Boolean((p.core_scores?.verdict_sublabels as string[] | undefined)?.includes(id));
}

/** Stable day index so the "pick of the day" rotates once per day, not per request. */
function dayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function rankBy(
  pool: ProductListItem[],
  scoreFn: (p: ProductListItem) => number,
  metaFn: (p: ProductListItem) => string | null,
  limit = 6,
): LandingPick[] {
  return pool
    .map((p) => ({ p, s: scoreFn(p) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ p }) => toPick(p, metaFn(p)));
}

function goalLabel(goal: GoalId): string {
  return GOAL_PROFILES.find((g) => g.id === goal)?.label ?? goal;
}

const GOAL_TAGLINES: Record<GoalId, string> = {
  balanced: "Highest all-round Core scores",
  gym: "Most protein without the junk",
  bulk: "Calorie-dense with real protein",
  diabetic: "Lowest sugar, scored clean",
  "fat-loss": "Filling, lower-calorie picks",
  pcos: "Low sugar, minimally processed",
  "protein-budget": "Most protein per rupee",
  kids: "Clean labels, no artificial colours",
};

function buildFacts(products: ProductListItem[], totalScored: number): LandingFact[] {
  const facts: LandingFact[] = [];
  const scored = products.filter((p) => p.core_scores);

  // 1. "Healthy"-marketed but weak
  const healthyRe =
    /\b(healthy|protein|zero|diet|lite|light|natural|nutri|wellness|immunity|digestive|sugar free|no added sugar)\b/i;
  const healthyMarketed = scored.filter((p) =>
    healthyRe.test(`${p.name} ${p.attributes?.["Key Features"] ?? ""}`),
  );
  const healthyButWeak = healthyMarketed.filter((p) => (p.core_scores?.score ?? 100) < 50);
  if (healthyMarketed.length >= 20 && healthyButWeak.length > 0) {
    const pct = Math.round((healthyButWeak.length / healthyMarketed.length) * 100);
    facts.push({
      stat: `${pct}%`,
      headline: `of products marketed as “healthy” actually score below 50`,
      prompt: "genuinely healthy snacks that score well",
      tone: "bad",
    });
  }

  // 2. Skip rate
  const skip = scored.filter((p) => p.core_scores?.verdict === "skip").length;
  if (skip > 0 && totalScored > 0) {
    const oneIn = Math.max(2, Math.round(totalScored / skip));
    facts.push({
      stat: `1 in ${oneIn}`,
      headline: `products here aren’t worth buying — Scout flags them so you skip them`,
      prompt: "daily staples worth buying",
      tone: "bad",
    });
  }

  // 3. Ultra-processed share
  const ultra = scored.filter(
    (p) => hasSublabel(p, "ultra_processed") || hasSublabel(p, "mostly_nova_4"),
  ).length;
  if (ultra > 0 && totalScored > 0) {
    const pct = Math.round((ultra / totalScored) * 100);
    if (pct >= 5) {
      facts.push({
        stat: `${pct}%`,
        headline: `of everything on the shelf is ultra-processed`,
        prompt: "whole-food snacks that aren’t ultra-processed",
        tone: "bad",
      });
    }
  }

  // 4. Low-sugar rarity in biscuits/snacks
  const biscuits = scored.filter((p) => /biscuit|cookie/i.test(p.category ?? p.subcategory ?? ""));
  const lowSugarBiscuits = biscuits.filter((p) => {
    const s = sugarOf(p.nutrition);
    return s != null && s < 5;
  });
  if (biscuits.length >= 15 && lowSugarBiscuits.length > 0) {
    facts.push({
      stat: `${lowSugarBiscuits.length} of ${biscuits.length}`,
      headline: `biscuits have under 5g sugar per 100g`,
      prompt: "biscuits with low sugar",
      tone: "neutral",
    });
  }

  // 5. Hidden sweeteners
  const hidden = scored.filter((p) => hasSublabel(p, "hidden_sweetener")).length;
  if (hidden >= 10) {
    facts.push({
      stat: `${hidden}`,
      headline: `products hide added sweeteners you wouldn’t spot on the front`,
      prompt: "snacks with no hidden sweeteners",
      tone: "bad",
    });
  }

  return facts.slice(0, 4);
}

function buildGoalBoards(products: ProductListItem[], ins: InsightLists): LandingGoalBoard[] {
  const scored = products.filter((p) => p.core_scores);

  const proteinMeta = (p: ProductListItem) => {
    const v = p.nutrition?.protein_g_100g;
    return typeof v === "number" ? `${Math.round(v)}g protein` : null;
  };
  const sugarMeta = (p: ProductListItem) => {
    const v = sugarOf(p.nutrition);
    return typeof v === "number" ? `${v.toFixed(1)}g sugar` : null;
  };
  const kcalMeta = (p: ProductListItem) => {
    const v = p.nutrition?.energy_kcal_100g;
    return typeof v === "number" ? `${Math.round(v)} kcal` : null;
  };
  const scoreMeta = (p: ProductListItem) => {
    const v = p.core_scores?.score;
    return typeof v === "number" ? `Score ${v}` : null;
  };

  const byGoal: Record<GoalId, LandingPick[]> = {
    balanced: ins.dailyStaples.slice(0, 6).map((r) => toPick(r.product, scoreMeta(r.product))),
    gym: (ins.gymPicks.length ? ins.gymPicks : ins.highProteinSnacks)
      .slice(0, 6)
      .map((r) => toPick(r.product, proteinMeta(r.product))),
    bulk: rankBy(
      scored.filter(
        (p) =>
          (p.nutrition?.protein_g_100g ?? 0) >= 10 &&
          (p.nutrition?.energy_kcal_100g ?? 0) >= 300 &&
          (p.core_scores?.score ?? 0) >= 45,
      ),
      (p) => (p.nutrition?.energy_kcal_100g ?? 0) + (p.nutrition?.protein_g_100g ?? 0) * 8,
      proteinMeta,
    ),
    diabetic: rankBy(
      scored.filter((p) => {
        const s = sugarOf(p.nutrition);
        return s != null && s < 5 && (p.core_scores?.score ?? 0) >= 50;
      }),
      (p) => (p.core_scores?.score ?? 0) - (sugarOf(p.nutrition) ?? 0),
      sugarMeta,
    ),
    "fat-loss": ins.lowCalorieFills.slice(0, 6).map((r) => toPick(r.product, kcalMeta(r.product))),
    pcos: rankBy(
      scored.filter((p) => {
        const s = sugarOf(p.nutrition);
        return (
          s != null &&
          s < 6 &&
          !hasSublabel(p, "ultra_processed") &&
          (p.core_scores?.score ?? 0) >= 50
        );
      }),
      (p) => p.core_scores?.score ?? 0,
      sugarMeta,
    ),
    "protein-budget": ins.proteinPerRupee.slice(0, 6).map((r) => toPick(r.product, proteinMeta(r.product))),
    kids: ins.kidFriendly.slice(0, 6).map((r) => toPick(r.product, scoreMeta(r.product))),
  };

  return GOAL_PROFILES.map((g) => ({
    goal: g.id,
    label: goalLabel(g.id),
    tagline: GOAL_TAGLINES[g.id],
    picks: byGoal[g.id] ?? [],
  })).filter((b) => b.picks.length > 0);
}

function buildPickOfDay(ins: InsightLists): LandingPickOfDay | null {
  const pool = ins.dailyStaples.length ? ins.dailyStaples : ins.bestInCohort;
  if (!pool.length) return null;

  const top = pool.slice(0, 12);
  const chosen = top[dayIndex() % top.length]!.product;

  const reasons: string[] = [];
  const protein = chosen.nutrition?.protein_g_100g;
  const fiber = chosen.nutrition?.fiber_g_100g;
  const sug = sugarOf(chosen.nutrition);
  if (typeof protein === "number" && protein >= 8) reasons.push(`${Math.round(protein)}g protein per 100g`);
  if (typeof fiber === "number" && fiber >= 5) reasons.push(`${Math.round(fiber)}g fibre per 100g`);
  if (typeof sug === "number" && sug <= 3) reasons.push(`only ${sug.toFixed(1)}g sugar`);
  if (hasSublabel(chosen, "whole_food")) reasons.push("whole-food ingredients");
  if (hasSublabel(chosen, "clean_protein")) reasons.push("clean protein source");
  if (!reasons.length && chosen.core_scores?.score != null) {
    reasons.push(`Core score ${chosen.core_scores.score}/100`);
  }

  return {
    pick: toPick(chosen, chosen.core_scores?.score != null ? `Score ${chosen.core_scores.score}` : null),
    reasons: reasons.slice(0, 3),
  };
}

export function buildLandingInsights(products: ProductListItem[]): LandingInsights {
  const scored = products.filter((p) => p.core_scores);
  const totalScored = scored.length;
  const avgScore = totalScored
    ? Math.round(scored.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / totalScored)
    : 0;
  const ins = buildInsights(products);

  return {
    totalScored,
    avgScore,
    facts: buildFacts(products, totalScored),
    pickOfDay: buildPickOfDay(ins),
    goalBoards: buildGoalBoards(products, ins),
  };
}
