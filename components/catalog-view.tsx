"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DietPicker } from "@/components/diet-picker";
import { GoalModePicker } from "@/components/goal-mode-picker";
import { ProductCard } from "@/components/product-card";
import { writeStoredGoal } from "@/lib/goals/storage";
import { GOAL_PROFILES, goalFromParam, type GoalId } from "@/lib/goals/types";
import { dietFromParam, type DietMode } from "@/lib/diet/types";
import { writeDietMode } from "@/lib/diet/storage";
import { saveCatalogReturnUrl } from "@/components/catalog-back-link";
import {
  catalogContextQuery,
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
import { CATALOG_SORT_OPTIONS } from "@/lib/products/catalog-sort";
import type { CatalogFilters, CatalogSearchResult } from "@/lib/products/queries";
import type { Grade } from "@/lib/supabase/types";

type Params = {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
};

const EMPTY_FILTERS: CatalogFilters = {
  categories: [],
  subcategories: [],
  usecases: [],
  brands: [],
};

const inputClass =
  "w-full min-w-0 appearance-none rounded-none border-0 border-b border-(--color-line) bg-transparent py-2.5 text-[15px] text-(--color-fg) outline-none transition placeholder:text-(--color-fg-dim)/70 focus:border-(--color-fg-muted)";

const selectClass =
  "min-w-0 cursor-pointer appearance-none rounded-none border-0 border-b border-(--color-line) bg-transparent py-2 text-sm text-(--color-fg) outline-none transition focus:border-(--color-fg-muted)";

const CATALOG_PAGE_SIZE = 96;
const SEARCH_DEBOUNCE_MS = 200;

function buildSearchRequest(
  activeState: CatalogFilterState,
  debouncedQ: string,
  goal: GoalId,
  diet: DietMode,
  page: number,
) {
  return {
    q: debouncedQ.trim() || undefined,
    category: activeState.category || undefined,
    subcategory: activeState.subcategory || undefined,
    usecase: activeState.usecase || undefined,
    brand: activeState.brand || undefined,
    scored: activeState.onlyScored ? "1" : undefined,
    min: activeState.minScore > 0 ? activeState.minScore : undefined,
    maxprice: activeState.maxPrice > 0 ? activeState.maxPrice : undefined,
    grade: activeState.grade || undefined,
    sort: goal === "balanced" ? activeState.sort : undefined,
    goal: goal !== "balanced" ? goal : undefined,
    diet: diet !== "any" ? diet : undefined,
    page,
    limit: CATALOG_PAGE_SIZE,
  };
}

function paramsFromLocation(): Params {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    usecase: sp.get("usecase") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    scored: sp.get("scored") ?? undefined,
    min: sp.get("min") ?? undefined,
    maxprice: sp.get("maxprice") ?? undefined,
    grade: sp.get("grade") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    goal: sp.get("goal") ?? undefined,
    diet: sp.get("diet") ?? undefined,
  };
}

function normalizeState(
  state: CatalogFilterState,
  options: CatalogFilters,
): CatalogFilterState {
  const next = { ...state };
  if (next.category && !options.categories.includes(next.category)) {
    next.category = "";
    next.subcategory = "";
    next.usecase = "";
    next.brand = "";
  }
  if (next.subcategory && !options.subcategories.includes(next.subcategory)) {
    next.subcategory = "";
    next.usecase = "";
  }
  if (next.usecase && !options.usecases.includes(next.usecase)) {
    next.usecase = "";
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

function goalFromParams(params: Params): GoalId {
  return params.goal ? goalFromParam(params.goal) : "balanced";
}

function dietFromParams(params: Params): DietMode {
  return params.diet ? dietFromParam(params.diet) : "any";
}

function paramsKey(params: Params): string {
  return JSON.stringify(params);
}

function syncFromParams(params: Params): {
  state: CatalogFilterState;
  goal: GoalId;
  diet: DietMode;
} {
  return {
    state: parseCatalogParams(params),
    goal: goalFromParams(params),
    diet: dietFromParams(params),
  };
}

export function CatalogView({
  initialParams,
  initialMeta,
  initialSearch,
}: {
  initialParams: Params;
  initialMeta?: CatalogMetaResponse;
  initialSearch?: CatalogSearchResult;
}) {
  const [state, setState] = useState<CatalogFilterState>(() =>
    parseCatalogParams(initialParams),
  );
  const [goal, setGoal] = useState<GoalId>(() => goalFromParams(initialParams));
  const [diet, setDiet] = useState<DietMode>(() => dietFromParams(initialParams));
  const [meta, setMeta] = useState<CatalogMetaResponse | null>(initialMeta ?? null);
  const [metaReady, setMetaReady] = useState(Boolean(initialMeta));
  const [items, setItems] = useState<CatalogGridItem[]>(() => initialSearch?.items ?? []);
  const [goalFits, setGoalFits] = useState<Record<string, number>>(
    () => initialSearch?.goalFits ?? {},
  );
  const [total, setTotal] = useState(() => initialSearch?.total ?? 0);
  const [page, setPage] = useState(() => initialSearch?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => initialSearch?.hasMore ?? false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showGoalHint, setShowGoalHint] = useState(false);
  const [loading, setLoading] = useState(() => !initialSearch);
  const fetchGen = useRef(0);
  const skipParamsSync = useRef(true);
  const skipInitialSearch = useRef(Boolean(initialSearch));

  const debouncedQ = useDebouncedValue(state.q, SEARCH_DEBOUNCE_MS);

  const initialKey = paramsKey(initialParams);
  useEffect(() => {
    if (skipParamsSync.current) {
      skipParamsSync.current = false;
      return;
    }
    const next = syncFromParams(initialParams);
    setState(next.state);
    setGoal(next.goal);
    setDiet(next.diet);
  }, [initialKey]);

  useEffect(() => {
    const onPop = () => {
      const next = syncFromParams(paramsFromLocation());
      setState(next.state);
      setGoal(next.goal);
      setDiet(next.diet);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    setShowGoalHint(
      !localStorage.getItem("scout-goal-v1") && !localStorage.getItem("oasis-goal-v1"),
    );
  }, []);

  const filterOptions = meta?.filters ?? EMPTY_FILTERS;

  const activeState = useMemo(() => {
    if (!metaReady) return state;
    return normalizeState(state, filterOptions);
  }, [state, filterOptions, metaReady]);

  const productQuery = useMemo(
    () => catalogContextQuery(activeState, goal, { diet }),
    [activeState, goal, diet],
  );

  const searchKey = useMemo(
    () =>
      JSON.stringify({
        q: debouncedQ.trim(),
        category: activeState.category,
        subcategory: activeState.subcategory,
        usecase: activeState.usecase,
        brand: activeState.brand,
        onlyScored: activeState.onlyScored,
        minScore: activeState.minScore,
        maxPrice: activeState.maxPrice,
        grade: activeState.grade,
        sort: activeState.sort,
        goal,
        diet,
      }),
    [
      debouncedQ,
      activeState.category,
      activeState.subcategory,
      activeState.usecase,
      activeState.brand,
      activeState.onlyScored,
      activeState.minScore,
      activeState.maxPrice,
      activeState.grade,
      activeState.sort,
      goal,
      diet,
    ],
  );

  useEffect(() => {
    if (initialMeta && !activeState.category) {
      setMeta(initialMeta);
      setMetaReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCatalogMeta(activeState.category || undefined);
        if (!cancelled) {
          setMeta(data);
          setMetaReady(true);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeState.category, initialMeta]);

  useEffect(() => {
    if (skipInitialSearch.current) {
      skipInitialSearch.current = false;
      return;
    }
    const gen = ++fetchGen.current;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const result = await fetchCatalogSearch(
          buildSearchRequest(activeState, debouncedQ, goal, diet, 1),
        );
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
  }, [searchKey]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    try {
      const result = await fetchCatalogSearch(
        buildSearchRequest(activeState, debouncedQ, goal, diet, nextPage),
      );
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
    saveCatalogReturnUrl(path);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [activeState, goal, diet]);

  const pickGoal = useCallback((g: GoalId) => {
    writeStoredGoal(g);
    setShowGoalHint(false);
    setGoal(g);
  }, []);

  const pickDiet = useCallback((d: DietMode) => {
    writeDietMode(d);
    setDiet(d);
  }, []);

  const patch = useCallback((partial: Partial<CatalogFilterState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      if (partial.category !== undefined && partial.category !== prev.category) {
        next.subcategory = "";
        next.usecase = "";
        next.brand = "";
      }
      if (
        partial.subcategory !== undefined &&
        partial.subcategory !== prev.subcategory
      ) {
        next.usecase = "";
      }
      return next;
    });
  }, []);

  const hasFilters = Boolean(
    activeState.q ||
      activeState.category ||
      activeState.subcategory ||
      activeState.usecase ||
      activeState.brand ||
      activeState.onlyScored ||
      activeState.minScore > 0 ||
      activeState.maxPrice > 0 ||
      activeState.grade ||
      activeState.sort !== "score-desc",
  );

  const clearAll = () => {
    setState({
      q: "",
      category: "",
      subcategory: "",
      usecase: "",
      brand: "",
      onlyScored: false,
      minScore: 0,
      maxPrice: 0,
      grade: "",
      sort: "score-desc",
    });
  };

  const catalogTotal = useMemo(() => {
    return meta?.stats.scored ?? meta?.stats.visible ?? total;
  }, [meta?.stats.scored, meta?.stats.visible, total]);

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
            Sorted by score (best first). Tap{" "}
            <span className="font-medium text-(--color-fg)">+</span> on a tile to add to your cart,
            or pick a goal above to re-rank.
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
              disabled={!metaReady || !filterOptions.subcategories.length}
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
            <span className="text-[11px] text-(--color-fg-dim)">Usecase</span>
            <select
              value={activeState.usecase}
              onChange={(e) => patch({ usecase: e.target.value })}
              className={selectClass}
              disabled={!metaReady || !filterOptions.usecases.length}
            >
              <option value="">All</option>
              {filterOptions.usecases.map((u) => (
                <option key={u} value={u}>
                  {u}
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
              disabled={!metaReady || !filterOptions.brands.length}
            >
              <option value="">All</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[12rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Sort</span>
            <select
              value={goal === "balanced" ? activeState.sort : "score-desc"}
              onChange={(e) => patch({ sort: e.target.value as CatalogFilterState["sort"] })}
              className={selectClass}
              disabled={goal !== "balanced"}
              title={goal !== "balanced" ? "Switch to Balanced to pick sort order" : undefined}
            >
              {CATALOG_SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[10rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Min score</span>
            <select
              value={activeState.minScore || ""}
              onChange={(e) =>
                patch({ minScore: e.target.value ? Number(e.target.value) : 0 })
              }
              className={selectClass}
            >
              <option value="">Any</option>
              <option value="40">40+</option>
              <option value="50">50+</option>
              <option value="60">60+</option>
              <option value="70">70+</option>
            </select>
          </label>

          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[10rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Max price</span>
            <select
              value={activeState.maxPrice || ""}
              onChange={(e) =>
                patch({ maxPrice: e.target.value ? Number(e.target.value) : 0 })
              }
              className={selectClass}
            >
              <option value="">Any</option>
              <option value="100">Under ₹100</option>
              <option value="200">Under ₹200</option>
              <option value="500">Under ₹500</option>
            </select>
          </label>

          <label className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[10rem]">
            <span className="text-[11px] text-(--color-fg-dim)">Grade</span>
            <select
              value={activeState.grade}
              onChange={(e) => patch({ grade: (e.target.value || "") as Grade | "" })}
              className={selectClass}
            >
              <option value="">Any</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
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
            <span className="text-(--color-fg)">
              {loading && items.length === 0 ? "…" : items.length.toLocaleString()}
            </span>
            {hasMore ? "+" : ""}
            <span className="mx-1">of</span>
            {catalogTotal ? catalogTotal.toLocaleString() : "…"}
            <span className="ml-1.5 hidden sm:inline">scored</span>
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
          className={`relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 ${
            loading ? "opacity-70" : "opacity-100"
          } transition-opacity duration-150`}
        >
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              hrefQuery={productQuery}
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
            disabled={loading}
            className="rounded-full border border-(--color-line) px-5 py-2 text-sm text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-50"
          >
            Show more ({Math.max(0, total - items.length).toLocaleString()} left)
          </button>
        </div>
      ) : null}

      {stats ? (
        <p className="text-center text-[11px] text-(--color-fg-dim)">
          {stats.scored.toLocaleString()} scored · {stats.visible.toLocaleString()} with labels
        </p>
      ) : null}
    </div>
  );
}
