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

const INITIAL_INGREDIENT_COUNT = 10;

function dotRiskForItem(item: IngredientDisplayItem): IngredientRisk {
  if (item.tierLabel === "Probiotic" || item.tierLabel.startsWith("Probiotic")) return "risk-free";
  if (item.source === "rules" && item.risk === "risk-free") return "unknown";
  return item.risk;
}

function riskRank(item: IngredientDisplayItem): number {
  if (item.risk === "hazardous") return 4;
  if (item.risk === "moderate") return 3;
  if (item.risk === "limited") return 2;
  return 0;
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
          "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors",
          hasWhy ? "hover:bg-(--color-bg-soft) cursor-pointer" : "cursor-default",
        )}
        onClick={() => hasWhy && setOpen((v) => !v)}
        disabled={!hasWhy}
      >
        <span
          className={cn(
            "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full",
            isProbiotic ? "bg-[#14b8a6]" : RISK_DOT[dotRisk],
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[12.5px] font-medium text-(--color-fg)">{item.display}</span>
            {item.eNumber ? (
              <span className="text-[10.5px] tabular-nums text-(--color-fg-dim)">{item.eNumber}</span>
            ) : null}
            {item.percent ? (
              <span className="text-[10.5px] text-(--color-fg-dim)">{item.percent}</span>
            ) : null}
            <span
              className={cn(
                "text-[10.5px] font-medium",
                isProbiotic ? "text-[#2dd4bf]" : RISK_TEXT[dotRisk],
              )}
            >
              {item.tierLabel}
            </span>
          </span>
        </span>
        {hasWhy ? (
          <span className="mt-0.5 shrink-0 text-(--color-fg-dim)">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        ) : null}
      </button>
      {open && item.why ? (
        <div className="border-t border-(--color-line) bg-(--color-bg-soft) px-2.5 py-2 pl-6">
          <p className="text-[12.5px] leading-relaxed text-(--color-fg-muted)">{item.why}</p>
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
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const items = parseIngredientsForDisplayWithIntelligence(ingredientsRaw, intelligenceRows);
  const summary = ingredientDisplaySummary(items);

  if (!items.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        Ingredient list not available yet — will appear after label scan.
      </p>
    );
  }

  const watchfulCount = items.filter((i) => i.risk === "limited").length;
  const allClean = summary.flagged === 0 && summary.hazardous === 0 && watchfulCount === 0;
  const concernCount = summary.flagged + watchfulCount;
  const visibleItems = showAllIngredients ? items : items.slice(0, INITIAL_INGREDIENT_COUNT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const highestRiskItem = [...items].sort((a, b) => riskRank(b) - riskRank(a))[0];
  const showRiskCallout = highestRiskItem && riskRank(highestRiskItem) > 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-(--color-line) bg-(--color-bg-soft) p-2 sm:grid-cols-2">
        <SummaryTile label="Ingredients" value={summary.total.toString()} />
        <SummaryTile
          label={summary.hazardous > 0 ? "High risk" : "Flagged"}
          value={
            allClean
              ? "0"
              : summary.hazardous > 0
                ? summary.hazardous.toString()
                : concernCount.toString()
          }
          tone={allClean ? "good" : summary.hazardous > 0 ? "bad" : "watch"}
        />
      </div>

      {showRiskCallout ? <RiskCallout item={highestRiskItem} /> : null}

      {/* ── ingredient list ── */}
      <div className="overflow-hidden rounded-lg border border-(--color-line) bg-(--color-panel)">
        <ul>
          {visibleItems.map((item) => (
            <IngredientRow key={item.key} item={item} />
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAllIngredients(true)}
            className="w-full border-t border-(--color-line) bg-(--color-bg-soft) px-3 py-2 text-left text-[12px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)"
          >
            Show {hiddenCount} more ingredient{hiddenCount !== 1 ? "s" : ""}
          </button>
        ) : showAllIngredients && items.length > INITIAL_INGREDIENT_COUNT ? (
          <button
            type="button"
            onClick={() => setShowAllIngredients(false)}
            className="w-full border-t border-(--color-line) bg-(--color-bg-soft) px-3 py-2 text-left text-[12px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)"
          >
            Collapse ingredient list
          </button>
        ) : null}
      </div>

      {/* ── raw label toggle ── */}
      {ingredientsRaw ? (
        <>
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="text-[10.5px] text-(--color-fg-dim) underline underline-offset-4 hover:text-(--color-fg-muted)"
          >
            {showFull ? "Hide" : "Show"} full label text
          </button>
          {showFull ? (
            <p className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-[12.5px] leading-relaxed text-(--color-fg-muted)">
              {ingredientsRaw}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
  caption,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "watch" | "bad";
  caption?: string;
}) {
  const color =
    tone === "good"
      ? "var(--score-excellent)"
      : tone === "watch"
        ? "var(--score-poor)"
        : tone === "bad"
          ? "var(--score-bad)"
          : "var(--color-fg)";

  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-(--color-fg-dim)">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold leading-none tabular-nums" style={{ color }}>
        {value}
      </p>
      {caption ? (
        <p className="mt-1 text-[10.5px] text-(--color-fg-dim)">{caption}</p>
      ) : null}
    </div>
  );
}

function RiskCallout({ item }: { item: IngredientDisplayItem }) {
  const bad = item.risk === "hazardous" || item.risk === "moderate";
  const color = bad ? "var(--score-bad)" : "var(--score-poor)";
  const why = item.why?.split(/(?<=[.!?])\s+/)[0]?.trim();

  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 38%, var(--color-line))`,
        backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-panel))`,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>
        Ingredient to notice
      </p>
      <p className="mt-1 text-sm font-semibold text-(--color-fg)">
        {item.display}
        <span className="ml-2 text-[11px] font-medium" style={{ color }}>
          {item.tierLabel}
        </span>
      </p>
      {why ? (
        <p className="mt-1 text-[12.5px] leading-snug text-(--color-fg-muted)">{why}</p>
      ) : null}
    </div>
  );
}
