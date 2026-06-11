import { dietBadgeLabel, productDietBadge, type DietBadge } from "@/lib/diet/match";
import type { DietMode } from "@/lib/diet/types";
import { cn } from "@/lib/utils";

const STYLE: Record<DietBadge, string> = {
  vegan: "bg-(--color-good)/10 text-(--color-good) ring-(--color-good)/25",
  veg: "bg-(--color-good)/10 text-(--color-good) ring-(--color-good)/25",
  "veg-eggs": "bg-(--color-warn)/10 text-(--color-warn) ring-(--color-warn)/25",
  "non-veg": "bg-(--color-bad)/10 text-(--color-bad) ring-(--color-bad)/25",
};

export function DietBadgeRow({
  badge,
  selected,
}: {
  badge: DietBadge;
  selected: DietMode;
}) {
  const incompatible =
    selected !== "any" &&
    !isDietCompatibleFromBadge(selected, badge);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset",
          STYLE[badge],
        )}
      >
        {dietBadgeLabel(badge)}
      </span>
      {incompatible ? (
        <span className="text-[12px] text-(--color-bad)">
          Doesn’t match your diet preference
        </span>
      ) : null}
    </div>
  );
}

export function DietBadgeChip({
  product,
  className,
}: {
  product: {
    ingredients_raw: string | null;
    attributes?: Record<string, string> | null;
    name?: string | null;
  };
  className?: string;
}) {
  const badge = productDietBadge(product);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-[2px] text-[10px] font-medium ring-1 ring-inset",
        STYLE[badge],
        className,
      )}
    >
      {dietBadgeLabel(badge)}
    </span>
  );
}

function isDietCompatibleFromBadge(diet: DietMode, badge: DietBadge): boolean {
  if (diet === "any") return true;
  if (diet === "vegan") return badge === "vegan";
  if (diet === "veg") return badge === "vegan" || badge === "veg";
  if (diet === "veg-eggs") return badge !== "non-veg";
  return true;
}
