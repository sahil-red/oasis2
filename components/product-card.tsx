"use client";

import { memo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { CompareButton } from "@/components/compare-button";
import { saveCatalogReturnUrl } from "@/components/catalog-back-link";
import { SearchScoreStack } from "@/components/search-score-tabs";
import { ScoreBadge } from "@/components/score-display";
import { tierFromScore, tierLabel, tierColor, rankShort } from "@/lib/utils";
import { catalogCardDisplayName } from "@/lib/products/card-display-name";
import {
  fetchCanonicalVariants,
  trackSearchInteraction,
  type CanonicalVariantItem,
} from "@/lib/products/catalog-api";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { sublabelChipLabels, VERDICT_COLORS } from "@/lib/scoring/verdict-display";
import { formatDeepseekChip } from "@/lib/ocr/deepseek-promote";
import type { VerdictId } from "@/lib/scoring/verdict";
import type { CatalogGridItem, ProductListItem } from "@/lib/products/queries";
import type { DietaryPrevalenceMap } from "@/lib/search/v2/types";
import { displayPriceInr, showMrpStrike } from "@/lib/products/display-price";

const VERDICT_SHORT: Record<VerdictId, string> = {
  daily_staple: "Staple",
  good_choice: "Good",
  occasional_treat: "Treat",
  skip: "Skip",
};

const CHIP_MAX = 3;
const CHIP_PRODUCT_SLOTS = 2;

function renderChips(
  obj: Record<string, unknown>,
  deepseekOrScoreChips: string[],
  aiReasons: string[],
  dietaryPrevalence?: DietaryPrevalenceMap | null,
): ReactNode[] {
  const chipClass = "inline-flex items-center rounded-full border border-(--color-line)/70 bg-(--color-bg-soft)/55 px-2 py-[2px] text-[10px] font-medium leading-tight text-(--color-fg-muted) max-w-[130px] truncate";
  const itemType = obj.primary_type as string | undefined;

  // Pre-computed display_chips from backend — use directly
  if (Array.isArray(obj.display_chips)) {
    return (obj.display_chips as string[]).slice(0, CHIP_MAX).map((l) => (
      <span key={l} className={chipClass}>{l}</span>
    ));
  }

  // Fallback: collect dietary badges with optional prevalence suppression
  const typePrev = itemType ? (dietaryPrevalence?.[itemType] ?? null) : null;
  const cohortTooSmall = typePrev ? typePrev.total < 5 : null;
  const candidates: Array<{ label: string; priority: number; isAi: boolean }> = [];
  const dietaryFlags: Array<{ key: string; label: string }> = [
    { key: "is_vegan", label: "Vegan" },
    { key: "is_gluten_free", label: "Gluten Free" },
    { key: "is_palm_oil_free", label: "No Palm Oil" },
    { key: "is_jain", label: "Jain" },
  ];
  for (const flag of dietaryFlags) {
    if (!obj[flag.key]) continue;
    if (typePrev && !cohortTooSmall) {
      const pct = typePrev[flag.key as keyof typeof typePrev] as number | undefined;
      if (pct != null && pct >= 0.8) continue;
    }
    candidates.push({ label: flag.label, priority: 60, isAi: false });
  }

  // deepseek chips or score-based chips
  for (const label of deepseekOrScoreChips) {
    candidates.push({ label, priority: 70, isAi: false });
  }

  // AI match reasons
  for (const reason of aiReasons) {
    candidates.push({ label: reason, priority: 65, isAi: true });
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const seen = new Set<string>();
  const result: string[] = [];

  // Fill product slots first (case-insensitive dedup)
  for (const c of candidates) {
    if (c.isAi) continue;
    if (result.length >= CHIP_PRODUCT_SLOTS) break;
    const key = c.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c.label);
  }

  // Fill remaining with AI reasons (case-insensitive dedup)
  for (const c of candidates) {
    if (!c.isAi) continue;
    if (result.length >= CHIP_MAX) break;
    const key = c.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c.label);
  }

  // Ensure at least 1 AI reason if available
  const hasAnyAi = result.some((r) => aiReasons.includes(r));
  if (!hasAnyAi && aiReasons.length > 0 && result.length >= CHIP_MAX) {
    result[CHIP_MAX - 1] = aiReasons[0]!;
  }

  return result.slice(0, CHIP_MAX).map((l) => (
    <span key={l} className={chipClass}>{l}</span>
  ));
}

export const ProductCard = memo(function ProductCard({
  product,
  goalFit,
  hrefQuery = "",
  onSublabelClick: _onSublabelClick,
  dietaryPrevalence,
}: {
  product: ProductListItem | CatalogGridItem;
  goalFit?: number;
  hrefQuery?: string;
  onSublabelClick?: (sublabel: string) => void;
  dietaryPrevalence?: DietaryPrevalenceMap | null;
}) {
  const thumb = product.image_urls[0];
  const core = product.core_scores;
  const verdict: VerdictId | null = core
    ? resolveProductVerdict({
        verdict: core.verdict,
        score: core.absolute_score ?? core.score,
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
      })
    : null;
  const price = displayPriceInr(product);
  const href = `/product/${product.slug}${hrefQuery}`;
  const displayName = catalogCardDisplayName(product.name);
  const sublabelIds = goalFit == null ? (core?.verdict_sublabels as string[] | undefined) : undefined;
  const scoreChipLabels = sublabelChipLabels(sublabelIds);
  const deepseekChipLabels =
    "deepseek_chips" in product && Array.isArray(product.deepseek_chips)
      ? product.deepseek_chips.map(formatDeepseekChip)
      : [];
  const chipLabels = deepseekChipLabels.length ? deepseekChipLabels : scoreChipLabels;
  const vc = verdict ? VERDICT_COLORS[verdict] : null;
  // Part B: unified health tier (from the consistent absolute score) + compact
  // category rank — replace the verdict pill + bare number on the card.
  const absForTier = core?.absolute_score ?? core?.score ?? null;
  const tier = absForTier != null ? tierFromScore(absForTier) : null;
  const tierC = tier ? tierColor(tier) : null;
  const rankBadge = rankShort(core?.category_rank, core?.category_size);
  const aiMatchScore = "ai_match_score" in product ? product.ai_match_score : undefined;
  const aiHealthScore =
    "ai_health_score" in product && typeof product.ai_health_score === "number"
      ? product.ai_health_score
      : goalFit ?? core?.score;
  const aiReasons =
    "ai_match_reasons" in product && Array.isArray(product.ai_match_reasons)
      ? product.ai_match_reasons
      : [];
  const aiWarning =
    "ai_match_warning" in product && typeof product.ai_match_warning === "string"
      ? product.ai_match_warning
      : null;
  const variantCount =
    "canonical_variant_count" in product && typeof product.canonical_variant_count === "number"
      ? product.canonical_variant_count
      : 0;
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [variants, setVariants] = useState<CanonicalVariantItem[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const aiReasonLines = aiReasons.filter((r) => !/^Scout(\s+score)?\s*\d/i.test(r)).slice(0, 3);
  const p = product as Record<string, unknown>;

  async function toggleVariants() {
    if (variantsOpen) {
      setVariantsOpen(false);
      return;
    }
    if (!variants.length && variantCount > 1) {
      setVariantsLoading(true);
      try {
        const rows = await fetchCanonicalVariants(product.id);
        setVariants(rows.filter((v) => v.id !== product.id));
      } finally {
        setVariantsLoading(false);
      }
    }
    setVariantsOpen(true);
  }

  return (
    <article className="group flex h-full flex-col">
      {/* image — verdict label as floating chip on top-left, score on top-right */}
      <Link
        href={href}
         className="relative block aspect-[3/4] overflow-hidden rounded-2xl photo-frame shadow-[0_1px_2px_rgba(60,40,20,0.05)] transition duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_34px_-20px_rgba(60,40,20,0.34)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)] dark:group-hover:shadow-[0_16px_34px_-18px_rgba(0,0,0,0.6)]"
        onClick={() => {
          saveCatalogReturnUrl(`/search${hrefQuery}`);
          trackSearchInteraction(product.id, "click");
        }}
      >
        {thumb ? (
          <Image
            src={thumb}
            alt={displayName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-(--color-fg-dim)">
            No image
          </div>
        )}

        {/* health tier pill, top-left (one consistent label, from absolute score) */}
        {tier && tierC ? (
          <span
            className="absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur-sm"
            style={{
              backgroundColor: `color-mix(in srgb, ${tierC} 16%, white)`,
              color: `color-mix(in srgb, ${tierC} 72%, black)`,
              borderColor: `color-mix(in srgb, ${tierC} 35%, transparent)`,
            }}
          >
            {tierLabel(tier)}
          </span>
        ) : verdict && vc ? (
          <span
            className="absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight"
            style={{
              backgroundColor: vc.bg,
              color: vc.fg,
              borderColor: vc.border,
            }}
          >
            {VERDICT_SHORT[verdict]}
          </span>
        ) : null}

        {/* score badge, top-right (subtle, not screaming) */}
        {aiMatchScore != null ? (
          <SearchScoreStack
            className="absolute right-2 top-2"
            matchScore={aiMatchScore}
            healthScore={aiHealthScore}
            verdict={verdict}
          />
        ) : goalFit != null ? (
          <div className="absolute right-2 top-2">
            <ScoreBadge score={goalFit} grade={"B" as const} verdict={null} />
          </div>
        ) : core && rankBadge ? (
          <span
            className="absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur-sm"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-bg) 82%, transparent)",
              color: tierC ?? "var(--color-fg-muted)",
              borderColor: "var(--color-border)",
            }}
          >
            {rankBadge}
          </span>
        ) : null}
      </Link>

      {/* content */}
      <div className="mt-3 flex flex-1 flex-col gap-1.5 px-1">
        <Link
          href={href}
          className="block flex-1"
          onClick={() => {
            saveCatalogReturnUrl(`/search${hrefQuery}`);
            trackSearchInteraction(product.id, "click");
          }}
        >
          <div className="flex items-center gap-1.5">
            {product.brand ? (
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
                {product.brand}
              </p>
            ) : (
              <span className="block h-[13px]" aria-hidden />
            )}
          </div>
          <h3 className="line-clamp-2 mt-0.5 text-[13.5px] font-medium leading-snug text-(--color-fg) group-hover:underline group-hover:underline-offset-2">
            {displayName}
          </h3>

          {/* Chips — unified display chips (pre-computed by getDisplayChips) or fallback */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {renderChips(p, chipLabels, aiReasonLines, dietaryPrevalence)}
          </div>
          {variantCount > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleVariants();
              }}
              className="mt-1 text-left text-[10.5px] text-(--color-accent) hover:underline"
            >
              {variantsLoading
                ? "Loading variants…"
                : variantsOpen
                  ? "Hide variants"
                  : `+${variantCount - 1} more variant${variantCount - 1 === 1 ? "" : "s"}`}
            </button>
          ) : null}
          {variantsOpen && variants.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-[10.5px] text-(--color-fg-muted)">
              {variants.slice(0, 4).map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/product/${v.slug}${hrefQuery}`}
                    className="hover:text-(--color-fg) hover:underline"
                    onClick={() => trackSearchInteraction(v.id, "click")}
                  >
                    {catalogCardDisplayName(v.name)}
                    {v.net_weight ? ` · ${v.net_weight}` : ""}
                    {v.price_inr != null ? ` · ₹${v.price_inr}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {aiWarning ? (
            <p className="mt-1 line-clamp-1 text-[10.5px] text-(--score-poor)">
              {aiWarning}
            </p>
          ) : null}
        </Link>

        {/* price row */}
        <div className="flex items-center justify-between gap-2 pt-1.5">
          <div className="min-w-0">
            {price != null ? (
              <span className="text-[14px] font-semibold tabular-nums text-(--color-fg)">
                ₹{price}
              </span>
            ) : (
              <span className="text-xs text-(--color-fg-dim)">—</span>
            )}
            {showMrpStrike(product) ? (
              <span className="ml-1 text-[10px] text-(--color-fg-dim) line-through tabular-nums">
                ₹{product.mrp_inr}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <CompareButton slug={product.slug} name={product.name} image={thumb ?? null} />
            <AddToBasketButton slug={product.slug} name={product.name} productId={product.id} size="icon" />
          </div>
        </div>
      </div>
    </article>
  );
});
