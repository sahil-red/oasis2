"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DietPicker } from "@/components/diet-picker";
import { GoalModePicker } from "@/components/goal-mode-picker";
import { ProductCard } from "@/components/product-card";
import { readStoredGoal, writeStoredGoal } from "@/lib/goals/storage";
import { GOAL_PROFILES, goalFromParam, type GoalId } from "@/lib/goals/types";
import { dietFromParam, type DietMode } from "@/lib/diet/types";
import { readDietMode, writeDietMode } from "@/lib/diet/storage";
import {
  catalogParamsToSearch,
  parseCatalogParams,
  type CatalogFilterState,
} from "@/lib/products/catalog-filter";
import {
  fetchCatalogMeta,
  fetchCatalogSearch,
  type CatalogGridItem,
  type CatalogMetaResponse,
} from "@/lib/products/catalog-api";
import type { CatalogFilters } from "@/lib/products/queries";

type Params = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
  goal?: string;
  diet?: string;
};

const inputClass =
  "w-full min-w-0 appearance-none rounded-none border-0 border-b border-(--color-line) bg-transparent py-2.5 text-[15px] text-(--color-fg) outline-none transition placeholder:text-(--color-fg-dim)/70 focus:border-(--color-fg-muted)";

const selectClass =
  "min-w-0 cursor-pointer appearance-none rounded-none border-0 border-b border-(--color-line) bg-transparent py-2 text-sm text-(--color-fg) outline-none transition focus:border-(--color-fg-muted)";

const CATALOG_PAGE_SIZE = 96;
const SEARCH_DEBOUNCE_MS = 280;

function normalizeState(
  state: CatalogFilterState,
  options: CatalogFilters,
): CatalogFilterState {
  const next = { ...state };
  if (next.category && !options.categories.includes(next.category)) {
    next.category = "";
    next.subcategory = "";
    next.brand = "";
  }
  if (next.subcategory && !options.subcategories.includes(next.subcategory)) {
    next.subcategory = "";
  }
  if (next.brand && !options.brands.includes(next.brand)) {
    next.brand = "";
  }
  return next;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function CatalogView({ initialParams }: { initialParams: Params }) {
  const [state, setState] = useState<CatalogFilterState>(() =>
    parseCatalogParams(initialParams),
  );
  const [goal, setGoal] = useState<GoalId>(() => {
    const fromUrl = goalFromParam(initialParams.goal);
    return fromUrl !== "balanced" || initialParams.goal
      ? fromUrl
      : readStoredGoal();
  });
  const [diet, setDiet] = useState<DietMode>(() => {
    if (initialParams.diet) return dietFromParam(initialParams.diet);
    return readDietMode();
  });
  const [meta, setMeta] = useState<CatalogMetaResponse | null>(null);
  const [items, setItems] = useState<CatalogGridItem[]>([]);
  const [goalFits, setGoalFits] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showGoalHint, setShowGoalHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchGen = useRef(0);

  const debouncedQ = useDebouncedValue(state.q, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (!initialParams.goal) {
      const stored = readStoredGoal();
      if (stored !== "balanced") setGoal(stored);
      setShowGoalHint(!localStorage.getItem("oasis-goal-v1"));
    }
    if (!initialParams.diet) {
      const storedDiet = readDietMode();
      if (storedDiet !== "any") setDiet(storedDiet);
    }
  }, [initialParams.goal, initialParams.diet]);

  const filterOptions = meta?.filters ?? {
    categories: [],
    subcategories: [],
    brands: [],
  };

  const activeState = useMemo(
    () => normalizeState(state, filterOptions),
    [state, filterOptions],
  );

  const searchKey = useMemo(
    () =>
      JSON.stringify({
        q: debouncedQ.trim(),
        category: activeState.category,
        subcategory: activeState.subcategory,
        brand: activeState.brand,
        onlyScored: activeState.onlyScored,
        goal,
        diet,
      }),
    [debouncedQ, activeState, goal, diet],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCatalogMeta(activeState.category || undefined);
        if (!cancelled) setMeta(data);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeState.category]);

  useEffect(() => {
    const gen = ++fetchGen.current;
    setLoading(true);
    setLoadError(null);
    setPage(1);

    (async () => {
      try {
        const result = await fetchCatalogSearch({
          q: debouncedQ.trim() || undefined,
          category: activeState.category || undefined,
          subcategory: activeState.subcategory || undefined,
          brand: activeState.brand || undefined,
          scored: activeState.onlyScored ? "1" : undefined,
          goal: goal !== "balanced" ? goal : undefined,
          diet: diet !== "any" ? diet : undefined,
          page: 1,
          limit: CATALOG_PAGE_SIZE,
        });
        if (gen !== fetchGen.current) return;
        setItems(result.items);
        setGoalFits(result.goalFits);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(1);
      } catch (e) {
        if (gen !== fetchGen.current) return;
        setLoadError((e as Error).message);
        setItems([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        if (gen === fetchGen.current) setLoading(false);
      }
    })();
  }, [searchKey, debouncedQ, activeState, goal, diet]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    try {
      const result = await fetchCatalogSearch({
        q: debouncedQ.trim() || undefined,
        category: activeState.category || undefined,
        subcategory: activeState.subcategory || undefined,
        brand: activeState.brand || undefined,
        scored: activeState.onlyScored ? "1" : undefined,
        goal: goal !== "balanced" ? goal : undefined,
        diet: diet !== "any" ? diet : undefined,
        page: nextPage,
        limit: CATALOG_PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...result.items]);
      setGoalFits((prev) => ({ ...prev, ...result.goalFits }));
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [page, debouncedQ, activeState, goal, diet]);

  useEffect(() => {
    const path = `/search${catalogParamsToSearch(activeState, goal, { diet })}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [activeState, goal, diet]);

  const pickGoal = useCallback((g: GoalId) => {
    writeStoredGoal(g);
    setShowGoalHint(false);
    startTransition(() => setGoal(g));
  }, []);

  const pickDiet = useCallback((d: DietMode) => {
    writeDietMode(d);
    startTransition(() => setDiet(d));
  }, []);

  const patch = useCallback((partial: Partial<CatalogFilterState>) => {
    startTransition(() => {
      setState((prev) => {
        const next = { ...prev, ...partial };
        if (
          partial.category !== undefined &&
          partial.category !== prev.category
        ) {
          next.subcategory = "";
          next.brand = "";
        }
        return next;
      });
    });
  }, []);

  const hasFilters = Boolean(
    activeState.q ||
      activeState.category ||
      activeState.subcategory ||
      activeState.brand ||
      activeState.onlyScored,
  );

  const clearAll = () => {
    startTransition(() => {
      setState({
        q: "",
        category: "",
        subcategory: "",
        brand: "",
        onlyScored: false,
      });
    });
  };

  const catalogTotal = meta?.stats.visible ?? 0;
  const stats = meta?.stats;

  if (loadError && !items.length && !meta) {
    return (
      <p className="py-16 text-center text-sm text-(--color-bad)">
        Could not load catalog ({loadError}). Refresh to try again.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        {showGoalHint ? (
          <div className="rounded-lg border border-(--color-line) bg-(--color-bg-soft) px-3 py-3">
            <p className="text-[14px] font-medium text-(--color-fg)">What are you shopping for?</p>
            <p className="mt-0.5 text-[12px] leading-snug text-(--color-fg-muted)">
              Tap a goal — rankings and colors update.
            </p>
            <div className="mt-2 space-y-2">
              <GoalModePicker value={goal} onChange={pickGoal} />
              <DietPicker value={diet} onChange={pickDiet} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <GoalModePicker value={goal} onChange={pickGoal} compact />
            <DietPicker value={diet} onChange={pickDiet} compact />
          </div>
        )}
        {goal !== "balanced" ? (
          <p className="text-sm text-(--color-fg-muted)">
            Showing best picks for{" "}
            <span className="font-medium text-(--color-fg)">
              {GOAL_PROFILES.find((g) => g.id === goal)?.label ?? goal}
            </span>
            . Numbers use the same green→red scale as overall scores.
          </p>
        ) : (
          <p className="text-sm text-(--color-fg-muted)">
            Tap <span className="font-medium text-(--color-fg)">+</span> on a tile to add to your
            cart, or pick a goal above to re-rank.
          </p>
        )}

        <div className="relative max-w-xl">
          <svg
            className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-dim)"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L17 17" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={state.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search products"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} pl-7`}
          />
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => patch({ category: "" })}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition ${
              !activeState.category
                ? "bg-(--color-fg) text-(--color-bg)"
                : "text-(--color-fg-muted) hover:text-(--color-fg)"
            }`}
          >
            All
          </button>
          {filterOptions.categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ category: c })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition ${
                activeState.category === c
                  ? "bg-(--color-fg) text-(--color-bg)"
                  : "text-(--color-fg-muted) hover:text-(--color-fg)"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[12rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Type</span>
            <select
              value={activeState.subcategory}
              onChange={(e) => patch({ subcategory: e.target.value })}
              className={selectClass}
              disabled={!filterOptions.subcategories.length}
            >
              <option value="">All</option>
              {filterOptions.subcategories.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[12rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Brand</span>
            <select
              value={activeState.brand}
              onChange={(e) => patch({ brand: e.target.value })}
              className={selectClass}
              disabled={!filterOptions.brands.length}
            >
              <option value="">All</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-(--color-fg-muted)">
            <input
              type="checkbox"
              checked={activeState.onlyScored}
              onChange={(e) => patch({ onlyScored: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-(--color-line-strong) accent-(--color-fg)"
            />
            Scored only
          </label>

          <p className="ml-auto pb-2 text-sm tabular-nums text-(--color-fg-dim)">
            <span className="text-(--color-fg)">{loading ? "…" : total}</span>
            <span className="mx-1">/</span>
            {catalogTotal || "…"}
          </p>
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[13px] text-(--color-fg-dim) transition hover:text-(--color-fg)"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="aspect-square rounded-xl bg-(--color-bg-soft)" />
              <div className="h-4 w-3/4 rounded bg-(--color-bg-soft)" />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <p className="py-20 text-center text-sm text-(--color-fg-muted)">
          No products match.
        </p>
      ) : (
        <div
          className={`grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity duration-150 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 ${
            isPending || loading ? "opacity-80" : "opacity-100"
          }`}
        >
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              goalFit={goal !== "balanced" ? goalFits[p.id] : undefined}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full border border-(--color-line) px-5 py-2 text-sm text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg)"
          >
            Show more ({total - items.length} left)
          </button>
        </div>
      ) : null}

      {stats ? (
        <p className="text-center text-[11px] text-(--color-fg-dim)">
          {stats.scored} scored · {stats.visible} with labels
        </p>
      ) : null}
    </div>
  );
}
