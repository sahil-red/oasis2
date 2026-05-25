"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ingredientSummary,
  parseIngredientsForDisplay,
  type IngredientRisk,
  type ParsedIngredient,
} from "@/lib/ingredients/parse";

const RISK_DOT: Record<IngredientRisk, string> = {
  "risk-free": "bg-(--color-good)",
  unknown: "bg-(--color-fg-dim)",
  limited: "bg-[#eab308]",
  moderate: "bg-(--color-warn)",
  hazardous: "bg-(--color-bad)",
};

const RISK_TEXT: Record<IngredientRisk, string> = {
  "risk-free": "text-(--color-good)",
  unknown: "text-(--color-fg-dim)",
  limited: "text-[#eab308]",
  moderate: "text-(--color-warn)",
  hazardous: "text-(--color-bad)",
};

function IngredientRow({ item }: { item: ParsedIngredient }) {
  const [open, setOpen] = useState(false);
  const hasWhy = Boolean(item.why);

  return (
    <li className="border-b border-(--color-line) last:border-0">
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
          hasWhy && "hover:bg-white/[0.02]",
          !hasWhy && "cursor-default",
        )}
        onClick={() => hasWhy && setOpen((v) => !v)}
        disabled={!hasWhy}
      >
        <span
          className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", RISK_DOT[item.risk])}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-(--color-fg)">{item.display}</span>
            {item.eNumber ? (
              <span className="text-xs tabular-nums text-(--color-fg-dim)">{item.eNumber}</span>
            ) : null}
            {item.percent ? (
              <span className="text-xs text-(--color-fg-dim)">{item.percent}</span>
            ) : null}
          </span>
          <span className={cn("mt-0.5 block text-xs", RISK_TEXT[item.risk])}>
            {item.tierLabel}
          </span>
        </span>
        {hasWhy ? (
          <span className="shrink-0 text-(--color-fg-dim)">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        ) : null}
      </button>
      {open && item.why ? (
        <div className="border-t border-(--color-line)/60 bg-(--color-panel-2) px-4 py-3 pl-9">
          <p className="text-sm leading-relaxed text-(--color-fg-muted)">{item.why}</p>
        </div>
      ) : null}
    </li>
  );
}

export function IngredientPanel({ ingredientsRaw }: { ingredientsRaw: string | null }) {
  const [showFull, setShowFull] = useState(false);
  const items = parseIngredientsForDisplay(ingredientsRaw);
  const summary = ingredientSummary(items);

  if (!items.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        Ingredient list not available yet — will appear after PDP scrape or label OCR.
      </p>
    );
  }

  const flaggedItems = items.filter((i) => i.flagged);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {summary.flagged > 0 ? (
          <span className="rounded-full border border-(--color-bad)/30 bg-(--color-bad)/10 px-3 py-1 text-(--color-bad)">
            {summary.flagged} flagged
          </span>
        ) : (
          <span className="rounded-full border border-(--color-good)/30 bg-(--color-good)/10 px-3 py-1 text-(--color-good)">
            No flagged additives
          </span>
        )}
        <span className="rounded-full border border-(--color-line) px-3 py-1 text-(--color-fg-muted)">
          {summary.total} ingredients
        </span>
        {summary.hazardous > 0 ? (
          <span className="rounded-full border border-(--color-bad)/40 px-3 py-1 text-(--color-bad)">
            {summary.hazardous} high risk
          </span>
        ) : null}
      </div>

      {flaggedItems.length > 0 ? (
        <div className="rounded-xl border border-(--color-warn)/20 bg-(--color-warn)/5 px-4 py-3">
          <div className="flex gap-2 text-sm text-(--color-fg-muted)">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-(--color-warn)" />
            <p>
              Tap a flagged ingredient to read why it affects your score. Yuka-style tiers:
              limited → moderate → high risk.
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
        <ul>
          {items.map((item) => (
            <IngredientRow key={item.key} item={item} />
          ))}
        </ul>
      </div>

      {ingredientsRaw ? (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="text-xs text-(--color-fg-dim) underline underline-offset-4 hover:text-(--color-fg-muted)"
        >
          {showFull ? "Hide" : "Show"} full label text
        </button>
      ) : null}
      {showFull && ingredientsRaw ? (
        <p className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm leading-relaxed text-(--color-fg-muted)">
          {ingredientsRaw}
        </p>
      ) : null}
    </div>
  );
}
