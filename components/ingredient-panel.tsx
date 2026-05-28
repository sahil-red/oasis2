"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ingredientDisplaySummary,
  parseIngredientsForDisplayWithIntelligence,
  type IngredientDisplayItem,
} from "@/lib/ingredients/display-from-intelligence";
import type { IngredientRisk } from "@/lib/ingredients/parse";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

const RISK_DOT: Record<IngredientRisk, string> = {
  "risk-free": "bg-[#22c55e]",
  unknown: "bg-(--color-fg-dim)/40",
  limited: "bg-[#f59e0b]",
  moderate: "bg-[#f59e0b]",
  hazardous: "bg-[#ef4444]",
};

const RISK_TEXT: Record<IngredientRisk, string> = {
  "risk-free": "text-[#4ade80]",
  unknown: "text-(--color-fg-dim)",
  limited: "text-[#fbbf24]",
  moderate: "text-[#fbbf24]",
  hazardous: "text-[#f87171]",
};

function dotRiskForItem(item: IngredientDisplayItem): IngredientRisk {
  if (item.tierLabel === "Probiotic" || item.tierLabel.startsWith("Probiotic")) return "risk-free";
  if (item.source === "rules" && item.risk === "risk-free") return "unknown";
  return item.risk;
}

function IngredientRow({ item }: { item: IngredientDisplayItem }) {
  const [open, setOpen] = useState(false);
  const hasWhy = Boolean(item.why);
  const dotRisk = dotRiskForItem(item);
  const isProbiotic = item.tierLabel === "Probiotic" || item.tierLabel.startsWith("Probiotic");

  return (
    <li className="border-b border-(--color-line) last:border-0">
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          hasWhy ? "hover:bg-(--color-bg-soft) cursor-pointer" : "cursor-default",
        )}
        onClick={() => hasWhy && setOpen((v) => !v)}
        disabled={!hasWhy}
      >
        <span
          className={cn(
            "mt-[5px] h-2 w-2 shrink-0 rounded-full",
            isProbiotic ? "bg-[#14b8a6]" : RISK_DOT[dotRisk],
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[13px] font-medium text-(--color-fg)">{item.display}</span>
            {item.eNumber ? (
              <span className="text-[11px] tabular-nums text-(--color-fg-dim)">{item.eNumber}</span>
            ) : null}
            {item.percent ? (
              <span className="text-[11px] text-(--color-fg-dim)">{item.percent}</span>
            ) : null}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[11px] font-medium",
              isProbiotic ? "text-[#2dd4bf]" : RISK_TEXT[dotRisk],
            )}
          >
            {item.tierLabel}
          </span>
        </span>
        {hasWhy ? (
          <span className="mt-0.5 shrink-0 text-(--color-fg-dim)">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        ) : null}
      </button>
      {open && item.why ? (
        <div className="border-t border-(--color-line) bg-(--color-bg-soft) px-4 py-3 pl-9">
          <p className="text-[13px] leading-relaxed text-(--color-fg-muted)">{item.why}</p>
        </div>
      ) : null}
    </li>
  );
}

export function IngredientPanel({
  ingredientsRaw,
  intelligenceRows = [],
}: {
  ingredientsRaw: string | null;
  intelligenceRows?: IngredientIntelligenceRow[];
}) {
  const [showFull, setShowFull] = useState(false);
  const items = parseIngredientsForDisplayWithIntelligence(ingredientsRaw, intelligenceRows);
  const summary = ingredientDisplaySummary(items);

  if (!items.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        Ingredient list not available yet — will appear after label scan.
      </p>
    );
  }

  // Summary bar
  const ratedPct = summary.total > 0 ? Math.round((summary.rated / summary.total) * 100) : 0;
  const watchfulCount = items.filter((i) => i.risk === "limited").length;
  const allClean = summary.flagged === 0 && summary.hazardous === 0 && watchfulCount === 0;
  const concernCount = summary.flagged + watchfulCount;

  return (
    <div className="space-y-3">
      {/* ── merged summary bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-3 py-2.5 text-[12px]">
        {allClean ? (
          <span className="flex items-center gap-1.5 font-semibold text-[#4ade80]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            No concerns
          </span>
        ) : summary.hazardous > 0 ? (
          <span className="flex items-center gap-1.5 font-semibold text-[#f87171]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
            {summary.hazardous} high risk · {summary.flagged} flagged
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-semibold text-[#f59e0b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            {concernCount} concern{concernCount !== 1 ? "s" : ""}
          </span>
        )}

        <span className="text-(--color-fg-dim)/40">·</span>

        {/* total count */}
        <span className="text-(--color-fg-muted)">
          {summary.total} ingredients
        </span>

        {/* rated coverage */}
        {summary.rated > 0 ? (
          <>
            <span className="text-(--color-fg-dim)/40">·</span>
            <span className="text-(--color-fg-muted)">
              <span className="font-medium text-(--color-fg)">{ratedPct}%</span> intelligence-rated
            </span>
          </>
        ) : null}
      </div>

      {/* ── ingredient list ── */}
      <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
        <ul>
          {items.map((item) => (
            <IngredientRow key={item.key} item={item} />
          ))}
        </ul>
      </div>

      {/* ── raw label toggle ── */}
      {ingredientsRaw ? (
        <>
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="text-[11px] text-(--color-fg-dim) underline underline-offset-4 hover:text-(--color-fg-muted)"
          >
            {showFull ? "Hide" : "Show"} full label text
          </button>
          {showFull ? (
            <p className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-[13px] leading-relaxed text-(--color-fg-muted)">
              {ingredientsRaw}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
