"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ingredientDisplaySummary,
  parseIngredientsForDisplayWithIntelligence,
  type IngredientDisplayItem,
} from "@/lib/ingredients/display-from-intelligence";
import type { IngredientRisk } from "@/lib/ingredients/parse";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

/** Risk → themeable colour token, used for dots, accents, and the meter. */
const RISK_VAR: Record<IngredientRisk, string> = {
  "risk-free": "var(--color-good)",
  unknown: "var(--color-fg-dim)",
  limited: "var(--color-warn)",
  moderate: "var(--color-warn)",
  hazardous: "var(--color-bad)",
};

function dotRiskForItem(item: IngredientDisplayItem): IngredientRisk {
  if (item.tierLabel === "Probiotic" || item.tierLabel.startsWith("Probiotic")) return "risk-free";
  if (item.source === "rules" && item.risk === "risk-free") return "unknown";
  return item.risk;
}

function riskColorForItem(item: IngredientDisplayItem): string {
  const isProbiotic = item.tierLabel === "Probiotic" || item.tierLabel.startsWith("Probiotic");
  return isProbiotic ? "var(--color-good)" : RISK_VAR[dotRiskForItem(item)];
}

function riskRank(item: IngredientDisplayItem): number {
  if (item.risk === "hazardous") return 4;
  if (item.risk === "moderate") return 3;
  if (item.risk === "limited") return 2;
  return 0;
}

/** Four readable bands the five risk tiers collapse into, for the meter + legend. */
type Band = "clean" | "unknown" | "watch" | "flagged";
function bandForItem(item: IngredientDisplayItem): Band {
  const r = dotRiskForItem(item);
  if (r === "hazardous") return "flagged";
  if (r === "limited" || r === "moderate") return "watch";
  if (r === "risk-free") return "clean";
  return "unknown";
}
const BAND_ORDER: Band[] = ["clean", "unknown", "watch", "flagged"];
const BAND_META: Record<Band, { color: string; label: string; faint?: boolean }> = {
  clean: { color: "var(--color-good)", label: "clean" },
  unknown: { color: "var(--color-fg-dim)", label: "unrated", faint: true },
  watch: { color: "var(--color-warn)", label: "to watch" },
  flagged: { color: "var(--color-bad)", label: "flagged" },
};

function IngredientRow({
  item,
  prominent = false,
}: {
  item: IngredientDisplayItem;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasWhy = Boolean(item.why);
  const riskColor = riskColorForItem(item);

  return (
    <li className="border-b border-(--color-line) last:border-0">
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-2.5 px-3 text-left transition-colors",
          prominent ? "py-2.5" : "py-1.5",
          hasWhy ? "cursor-pointer hover:bg-(--color-bg-soft)" : "cursor-default",
        )}
        style={prominent ? { boxShadow: `inset 3px 0 0 ${riskColor}` } : undefined}
        onClick={() => hasWhy && setOpen((v) => !v)}
        disabled={!hasWhy}
      >
        {!prominent ? (
          <span
            className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: riskColor }}
            aria-hidden
          />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={cn(
                "font-medium text-(--color-fg)",
                prominent ? "text-[13.5px]" : "text-[12.5px]",
              )}
            >
              {item.display}
            </span>
            {item.eNumber ? (
              <span className="text-[10.5px] tabular-nums text-(--color-fg-dim)">{item.eNumber}</span>
            ) : null}
            {item.percent ? (
              <span className="text-[10.5px] text-(--color-fg-dim)">{item.percent}</span>
            ) : null}
            {prominent ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                style={{
                  color: riskColor,
                  backgroundColor: `color-mix(in srgb, ${riskColor} 13%, transparent)`,
                }}
              >
                {item.tierLabel}
              </span>
            ) : (
              <span className="text-[10.5px] font-medium" style={{ color: riskColor }}>
                {item.tierLabel}
              </span>
            )}
          </span>
        </span>
        {hasWhy ? (
          <span className="mt-0.5 shrink-0 text-(--color-fg-dim)">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        ) : null}
      </button>
      {open && item.why ? (
        <div className="border-t border-(--color-line) bg-(--color-bg-soft) px-3 py-2 pl-7">
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
  const items = parseIngredientsForDisplayWithIntelligence(ingredientsRaw, intelligenceRows);
  const summary = ingredientDisplaySummary(items);

  if (!items.length) {
    return (
      <p className="text-sm text-(--color-fg-muted)">
        Ingredient list not available yet — will appear after label scan.
      </p>
    );
  }

  // Band counts power the meter + legend, kept consistent with the per-row dots.
  const counts: Record<Band, number> = { clean: 0, unknown: 0, watch: 0, flagged: 0 };
  for (const it of items) counts[bandForItem(it)]++;
  const total = summary.total;
  const concernCount = counts.watch + counts.flagged;
  const worstColor =
    counts.flagged > 0
      ? "var(--color-bad)"
      : counts.watch > 0
        ? "var(--color-warn)"
        : "var(--color-good)";

  const phrase =
    concernCount === 0
      ? "Clean label"
      : counts.flagged > 0
        ? counts.flagged === 1
          ? "One flagged additive"
          : `${counts.flagged} flagged additives`
        : counts.watch === 1
          ? "One worth a look"
          : `${counts.watch} worth a look`;

  const segments = BAND_ORDER.map((b) => ({ band: b, n: counts[b], ...BAND_META[b] })).filter(
    (s) => s.n > 0,
  );

  // The ingredients that actually move the score — worst first.
  const flagged = [...items]
    .filter((i) => riskRank(i) > 0)
    .sort((a, b) => riskRank(b) - riskRank(a));

  return (
    <div className="space-y-3">
      {/* ── Ingredient read: an editorial verdict + a segmented safety meter ── */}
      <div className="panel-soft rounded-xl p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--color-fg-dim)">
            Ingredient read
          </p>
          <p className="shrink-0 text-[11px] text-(--color-fg-dim)">
            <span className="font-medium tabular-nums text-(--color-fg-muted)">{total}</span> ingredients
          </p>
        </div>
        <p
          className="mt-1.5 font-display text-[1.45rem] leading-tight"
          style={{ color: concernCount ? worstColor : "var(--color-fg)" }}
        >
          {phrase}
        </p>

        <div className="mt-3 flex h-2 w-full gap-0.5">
          {segments.map((s) => (
            <div
              key={s.band}
              className="h-full rounded-full"
              style={{
                flex: `${s.n} 0 0`,
                minWidth: s.band === "watch" || s.band === "flagged" ? "0.5rem" : undefined,
                backgroundColor: s.color,
                opacity: s.faint ? 0.3 : 1,
              }}
            />
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((s) => (
            <span
              key={s.band}
              className="inline-flex items-center gap-1.5 text-[11px] text-(--color-fg-muted)"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color, opacity: s.faint ? 0.45 : 1 }}
                aria-hidden
              />
              <span className="font-medium tabular-nums text-(--color-fg)">{s.n}</span> {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Worth noticing — the few that matter, expandable for why ── */}
      {flagged.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
          <p className="border-b border-(--color-line) bg-(--color-bg-soft) px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--color-fg-dim)">
            Worth noticing
          </p>
          <ul>
            {flagged.map((item, i) => (
              <IngredientRow key={`flag-${item.display}-${i}`} item={item} prominent />
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-(--color-good)/30 bg-(--color-good)/[0.06] px-3.5 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-(--color-good)/15 text-(--color-good)">
            <Check className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-(--color-fg)">Nothing we&apos;d flag.</p>
            <p className="text-[12px] text-(--color-fg-muted)">
              All {total} ingredients read low-risk.
            </p>
          </div>
        </div>
      )}

      {/* ── Full list — collapsed, label order ── */}
      <details className="group overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)">
          <span className="transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          All {total} ingredients
        </summary>
        <ul className="border-t border-(--color-line)">
          {items.map((item, i) => (
            <IngredientRow key={`${item.display}-${item.percent ?? ""}-${i}`} item={item} />
          ))}
        </ul>
      </details>

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
