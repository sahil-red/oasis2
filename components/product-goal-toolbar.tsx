"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GoalModePicker } from "@/components/goal-mode-picker";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { writeStoredGoal } from "@/lib/goals/storage";
import { goalFromParam, type GoalId } from "@/lib/goals/types";

export function ProductGoalToolbar({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const goal = goalFromParam(searchParams.get("goal"));

  const setGoal = (g: GoalId) => {
    writeStoredGoal(g);
    const p = new URLSearchParams(searchParams.toString());
    if (g === "balanced") p.delete("goal");
    else p.set("goal", g);
    const q = p.toString();
    window.location.href = q ? `${pathname}?${q}` : pathname;
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AddToBasketButton slug={slug} name={name} />
        <Link
          href="/basket"
          className="text-sm text-(--color-accent) hover:underline"
        >
          View cart analysis
        </Link>
      </div>
      <GoalModePicker value={goal} onChange={setGoal} compact />
    </div>
  );
}
