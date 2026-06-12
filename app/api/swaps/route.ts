import { NextResponse } from "next/server";
import { findAlternatives, type SwapSuggestion } from "@/lib/products/alternatives";
import type { GoalId } from "@/lib/goals/types";
import { GOAL_PROFILES } from "@/lib/goals/types";
import { dietFromParam } from "@/lib/diet/types";
import { getProductsBySlugs, getProductsForSwaps } from "@/lib/products/queries";

export const revalidate = 60;

const GOAL_IDS = new Set(GOAL_PROFILES.map((g) => g.id));

/** Cart / client: same-aisle swaps for one or more slugs. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slugs = [...new Set((params.get("slugs")?.split(",").filter(Boolean) ?? []))].slice(0, 12);
  const goalParam = params.get("goal") ?? "balanced";
  const goal = (GOAL_IDS.has(goalParam as GoalId) ? goalParam : "balanced") as GoalId;
  const diet = dietFromParam(params.get("diet"));

  if (!slugs.length) {
    return NextResponse.json(
      { goal, swaps: {} as Record<string, SwapSuggestion[]> },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  }

  const products = await getProductsBySlugs(slugs);
  const swaps: Record<string, SwapSuggestion[]> = {};

  // Group products by aisle to avoid N+1: one DB query per unique category combo.
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.l3_category ?? `${p.category ?? ""}::${p.subcategory ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  await Promise.all(
    [...groups.values()].map(async (group) => {
      const pool = await getProductsForSwaps(group[0], 200);
      for (const current of group) {
        swaps[current.slug] = findAlternatives(current, pool, goal, 3, { diet });
      }
    }),
  );

  for (const slug of slugs) {
    if (!swaps[slug]) swaps[slug] = [];
  }

  return NextResponse.json(
    { goal, swaps },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
