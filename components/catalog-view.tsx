"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
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
  fetchAiCatalogSearch,
  fetchCatalogSearch,
  fetchLandingInsights,
  prefetchCatalogSearch,
  type CatalogGridItem,
  type CatalogMetaResponse,
} from "@/lib/products/catalog-api";
import type {
  LandingFact,
  LandingInsights,
  LandingPick,
} from "@/lib/products/landing-insights";
import {
  canUseAiSearch,
  readAiSearchPreferences,
  readAiSearchUsage,
  recordAiSearch,
  writeAiSearchPreferences,
  type AiSearchPreferences,
  type AiSearchUsage,
} from "@/lib/search/ai-usage";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import {
  CATALOG_BAR_SORT_OPTIONS,
  CATALOG_SORT_OPTIONS,
  type CatalogSort,
} from "@/lib/products/catalog-sort";
import type { CatalogFilters, CatalogSearchResult, ProductListItem } from "@/lib/products/queries";
import type { Grade } from "@/lib/supabase/types";

type Params = {
  prompt?: string;
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  labelResolved?: string;
  deepseek?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
  sublabel?: string;
  verdict?: string;
};

const EMPTY_FILTERS: CatalogFilters = {
  categories: [],
  subcategories: [],
  usecases: [],
  brands: [],
};

const inputClass =
  "w-full min-w-0 appearance-none rounded-none border-0 border-b border-(--color-line) bg-transparent py-2.5 text-[15px] text-(--color-fg) outline-none transition placeholder:text-(--color-fg-dim)/70 focus:border-(--color-fg-muted)";

const filterSelectClass =
  "w-full cursor-pointer appearance-none rounded-lg border border-(--color-line) bg-(--color-bg) py-2 pl-3 pr-9 text-sm text-(--color-fg) outline-none transition hover:border-(--color-line-strong) focus:border-(--color-fg-muted) focus:ring-1 focus:ring-(--color-line-strong) disabled:cursor-not-allowed disabled:opacity-50";

const CATALOG_PAGE_SIZE = 96;
const SEARCH_DEBOUNCE_MS = 120;
const AI_PROMPT_EXAMPLES = [
  "biscuits with low sugar",
  "paneer with low fat under ₹150",
  "high protein snacks for gym",
  "kids snacks without artificial colours",
];


function countActiveFilters(state: CatalogFilterState): number {
  let n = 0;
  if (state.category) n++;
  if (state.subcategory) n++;
  if (state.usecase) n++;
  if (state.brand) n++;
  if (state.onlyScored) n++;
  if (state.onlyLabelResolved) n++;
  if (state.onlyDeepseek) n++;
  if (state.minScore > 0) n++;
  if (state.maxPrice > 0) n++;
  if (state.grade) n++;
  if (state.sublabel) n++;
  if (state.verdict) n++;
  return n;
}

const catalogBarButtonClass =
  "flex shrink-0 cursor-pointer list-none items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-bg-soft)/40 px-4 py-2.5";

function sortBarLabel(sort: CatalogSort): string {
  return CATALOG_BAR_SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Score";
}

function FilterSelect({
  label,
  children,
  ...props
}: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium tracking-wide text-(--color-fg-muted)">{label}</span>
      <div className="relative">
        <select className={filterSelectClass} {...props}>
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-dim)"
          aria-hidden
        />
      </div>
    </label>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-(--color-line) bg-(--color-bg) px-3 py-1 text-[12px] text-(--color-fg) transition hover:border-(--color-line-strong)"
      title="Remove filter"
    >
      <span className="truncate">{label}</span>
      <span className="text-(--color-fg-dim)" aria-hidden>
        ×
      </span>
    </button>
  );
}

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
    labelResolved: activeState.onlyLabelResolved ? "1" : undefined,
    deepseek: activeState.onlyDeepseek ? "1" : undefined,
    min: activeState.minScore > 0 ? activeState.minScore : undefined,
    maxprice: activeState.maxPrice > 0 ? activeState.maxPrice : undefined,
    grade: activeState.grade || undefined,
    sort: activeState.sort !== "score-desc" ? activeState.sort : undefined,
    goal: goal !== "balanced" ? goal : undefined,
    diet: diet !== "any" ? diet : undefined,
    sublabel: activeState.sublabel || undefined,
    verdict: activeState.verdict || undefined,
    page,
    limit: CATALOG_PAGE_SIZE,
  };
}

function paramsFromLocation(): Params {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") ?? undefined,
    prompt: sp.get("prompt") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    usecase: sp.get("usecase") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    scored: sp.get("scored") ?? undefined,
    labelResolved: sp.get("labelResolved") ?? undefined,
    deepseek: sp.get("deepseek") ?? undefined,
    min: sp.get("min") ?? undefined,
    maxprice: sp.get("maxprice") ?? undefined,
    grade: sp.get("grade") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    goal: sp.get("goal") ?? undefined,
    diet: sp.get("diet") ?? undefined,
    sublabel: sp.get("sublabel") ?? undefined,
    verdict: sp.get("verdict") ?? undefined,
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

function preferencesToPrompt(prefs: AiSearchPreferences | null): string {
  if (!prefs) return "";
  const parts = [
    prefs.diet ? `diet ${prefs.diet}` : null,
    prefs.healthContexts?.length ? `health goals ${prefs.healthContexts.join(", ")}` : null,
    prefs.avoidIngredients?.length ? `avoid ${prefs.avoidIngredients.join(", ")}` : null,
    prefs.budget ? `budget under ₹${prefs.budget}` : null,
  ].filter(Boolean);
  return parts.length ? `Saved preferences: ${parts.join("; ")}.` : "";
}

function preferencesFromParsed(parsed: ParsedProductQuery): AiSearchPreferences {
  return {
    diet: parsed.hard_constraints.vegetarian ? "vegetarian" : undefined,
    healthContexts: parsed.health_contexts,
    avoidIngredients: parsed.hard_constraints.avoid_ingredients,
    budget: parsed.hard_constraints.max_price ?? null,
  };
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchGen = useRef(0);
  const skipParamsSync = useRef(true);
  const skipInitialSearch = useRef(Boolean(initialSearch));
  const autoPromptRan = useRef(false);
  const goalSentinelRef = useRef<HTMLDivElement>(null);
  const [goalStripScrolledPast, setGoalStripScrolledPast] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(initialParams.prompt ?? initialParams.q ?? "");
  const [aiMode, setAiMode] = useState(false);
  const [factBrowse, setFactBrowse] = useState<{
    headline: string;
    items: ProductListItem[];
    total: number;
  } | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiParseSource, setAiParseSource] = useState<"deepseek" | "heuristic" | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [aiRefinements, setAiRefinements] = useState<string[]>([]);
  const [aiUsage, setAiUsage] = useState<AiSearchUsage | null>(null);
  const [aiParsed, setAiParsed] = useState<ParsedProductQuery | null>(null);
  const [savedPrefs, setSavedPrefs] = useState<AiSearchPreferences | null>(null);

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
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const next = syncFromParams(paramsFromLocation());
      setState(next.state);
      setGoal(next.goal);
      setDiet(next.diet);
      skipInitialSearch.current = false;
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    setShowGoalHint(
      !localStorage.getItem("scout-goal-v1") && !localStorage.getItem("oasis-goal-v1"),
    );
    setAiUsage(readAiSearchUsage());
    setSavedPrefs(readAiSearchPreferences());
  }, []);

  useEffect(() => {
    const el = goalSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setGoalStripScrolledPast(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-56px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [showGoalHint]);

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
        onlyLabelResolved: activeState.onlyLabelResolved,
        onlyDeepseek: activeState.onlyDeepseek,
        minScore: activeState.minScore,
        maxPrice: activeState.maxPrice,
        grade: activeState.grade,
        sort: activeState.sort,
        sublabel: activeState.sublabel,
        verdict: activeState.verdict,
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
      activeState.onlyLabelResolved,
      activeState.onlyDeepseek,
      activeState.minScore,
      activeState.maxPrice,
      activeState.grade,
      activeState.sort,
      activeState.sublabel,
      activeState.verdict,
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
    if (aiMode) return;
    if (skipInitialSearch.current) {
      skipInitialSearch.current = false;
      return;
    }
    const gen = ++fetchGen.current;
    setLoadError(null);
    if (items.length > 0) setRefreshing(true);
    else setLoading(true);

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
        if (items.length === 0) {
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
  }, [searchKey, aiMode]);

  useEffect(() => {
    if (aiMode || !hasMore || loading || refreshing || loadError) return;
    prefetchCatalogSearch(buildSearchRequest(activeState, debouncedQ, goal, diet, page + 1));
  }, [aiMode, hasMore, page, searchKey, loading, refreshing, loadError, activeState, debouncedQ, goal, diet]);

  const loadMore = useCallback(async () => {
    if (aiMode) return;
    const nextPage = page + 1;
    setLoadingMore(true);
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
    } finally {
      setLoadingMore(false);
    }
  }, [aiMode, page, debouncedQ, activeState, goal, diet]);

  const prevUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const path = `/search${catalogParamsToSearch(activeState, goal, { diet })}`;
    saveCatalogReturnUrl(path);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      // pushState so browser back button can restore this exact filter state via bfcache
      window.history.pushState(null, "", path);
    }
    prevUrlRef.current = path;
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
    setAiMode(false);
    setAiSummary(null);
    setAiWarning(null);
    setAiRefinements([]);
    setAiParsed(null);
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

  const runAiSearch = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride ?? aiPrompt).trim();
    if (!prompt) return;
    setLoadError(null);
    if (!canUseAiSearch()) {
      const usage = readAiSearchUsage();
      setAiUsage(usage);
      setLoadError(
        `Free AI searches used for today (${usage.count}/${usage.limit}). Upgrade will unlock unlimited searches.`,
      );
      return;
    }

    const gen = ++fetchGen.current;
    setAiSearching(true);
    setRefreshing(items.length > 0);
    try {
      const prefContext = preferencesToPrompt(savedPrefs);
      const result = await fetchAiCatalogSearch(
        prefContext ? `${prompt}. ${prefContext}` : prompt,
        CATALOG_PAGE_SIZE,
      );
      if (gen !== fetchGen.current) return;
      setItems(result.items);
      setGoalFits({});
      setTotal(result.items.length);
      setPage(1);
      setHasMore(false);
      setAiMode(true);
      setFactBrowse(null);
      setAiSummary(result.summary);
      setAiParseSource(result.parse_source);
      setAiWarning(result.parse_warning ?? null);
      setAiRefinements(result.refinements);
      setAiParsed(result.parsed);
      setAiUsage(recordAiSearch());
      saveCatalogReturnUrl("/search");
    } catch (e) {
      if (gen !== fetchGen.current) return;
      setLoadError((e as Error).message);
    } finally {
      if (gen === fetchGen.current) {
        setAiSearching(false);
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [aiPrompt, items.length, savedPrefs]);

  const handleFactAction = useCallback(
    async (fact: LandingFact) => {
      setLoadError(null);
      setFactBrowse(null);
      setAiMode(false);
      const { action } = fact;

      if (action.type === "expose") {
        setRefreshing(true);
        setLoading(true);
        try {
          const slugs = action.slugs.slice(0, 40);
          const res = await fetch(`/api/products?slugs=${encodeURIComponent(slugs.join(","))}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const products = (await res.json()) as ProductListItem[];
          setFactBrowse({
            headline: fact.headline,
            items: products,
            total: action.slugs.length,
          });
          setItems(products as unknown as CatalogGridItem[]);
          setGoalFits({});
          setTotal(products.length);
          setPage(1);
          setHasMore(false);
          saveCatalogReturnUrl("/search");
        } catch (e) {
          setLoadError((e as Error).message);
        } finally {
          setRefreshing(false);
          setLoading(false);
        }
        return;
      }

      if (action.type === "catalog") {
        patch({
          sublabel: action.sublabel ?? "",
          verdict: action.verdict ?? "",
          sort: (action.sort ?? "score-desc") as CatalogSort,
        });
        return;
      }

      setAiPrompt(action.prompt);
      void runAiSearch(action.prompt);
    },
    [patch, runAiSearch],
  );

  useEffect(() => {
    if (autoPromptRan.current || !initialParams.prompt?.trim()) return;
    autoPromptRan.current = true;
    void runAiSearch(initialParams.prompt);
  }, [initialParams.prompt, runAiSearch]);

  const hasFilters = Boolean(
    activeState.q ||
      activeState.category ||
      activeState.subcategory ||
      activeState.usecase ||
      activeState.brand ||
      activeState.onlyScored ||
      activeState.onlyLabelResolved ||
      activeState.onlyDeepseek ||
      activeState.minScore > 0 ||
      activeState.maxPrice > 0 ||
      activeState.grade ||
      activeState.sublabel ||
      activeState.verdict ||
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
      onlyLabelResolved: false,
      onlyDeepseek: false,
      minScore: 0,
      maxPrice: 0,
      grade: "",
      sort: "score-desc",
      sublabel: "",
      verdict: "",
    });
  };

  const handleSublabelClick = useCallback((sublabel: string) => {
    patch({ sublabel: activeState.sublabel === sublabel ? "" : sublabel });
  }, [activeState.sublabel, patch]);

  const stats = meta?.stats;
  const activeFilterCount = countActiveFilters(activeState);
  const goalLabel = GOAL_PROFILES.find((g) => g.id === goal)?.label ?? goal;

  if (loadError && !items.length && !meta) {
    return (
      <p className="py-16 text-center text-sm text-(--color-bad)">
        Could not load catalog ({loadError}). Refresh to try again.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div ref={goalSentinelRef} className="h-px w-full shrink-0" aria-hidden />

        <section className="pb-2">
          <p className="font-display mb-4 text-3xl font-bold leading-tight tracking-tight text-(--color-fg) md:text-4xl">
            Ask Scout
          </p>
          <form
            className="flex flex-col gap-2 md:flex-row md:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              void runAiSearch();
            }}
          >
            <input
              type="search"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. paneer with low fat under ₹150"
              className="min-h-[52px] flex-1 rounded-2xl border border-(--color-line-strong) bg-(--color-bg) px-5 text-[15px] text-(--color-fg) outline-none ring-0 transition placeholder:text-(--color-fg-dim) focus:border-(--color-fg-muted) focus:ring-2 focus:ring-(--color-fg-muted)/20"
            />
            <button
              type="submit"
              disabled={aiSearching || !aiPrompt.trim()}
              className="min-h-[52px] rounded-2xl bg-(--color-fg) px-6 text-sm font-semibold text-(--color-bg) transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiSearching ? "Searching…" : "Search"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {AI_PROMPT_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setAiPrompt(example);
                  void runAiSearch(example);
                }}
                className="rounded-full border border-(--color-line-strong) px-3 py-1.5 text-[12px] text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg)"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-(--color-fg-dim)">
            <span>{aiUsage ? `${aiUsage.count}/${aiUsage.limit}` : "0/10"} searches today</span>
            {savedPrefs && preferencesToPrompt(savedPrefs) ? (
              <>
                <span className="hidden h-3 w-px bg-(--color-line) sm:inline-block" aria-hidden />
                <span>Preferences saved</span>
              </>
            ) : null}
          </div>

          {aiMode && aiSummary ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--color-line) pt-4">
              <p className="text-[13px] font-medium text-(--color-fg)">{aiSummary}</p>
              {aiWarning ? (
                <p className="text-[12px] text-(--color-fg-dim)">{aiWarning}</p>
              ) : null}
              {aiParsed ? (
                <button
                  type="button"
                  onClick={() => {
                    const prefs = preferencesFromParsed(aiParsed);
                    writeAiSearchPreferences(prefs);
                    setSavedPrefs(prefs);
                  }}
                  className="ml-auto rounded-full border border-(--color-line-strong) px-3 py-1 text-[11px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)"
                >
                  Save preferences
                </button>
              ) : null}
              {aiRefinements.length > 0 ? (
                <div className="flex w-full flex-wrap gap-2">
                  {aiRefinements.map((refinement) => (
                    <button
                      key={refinement}
                      type="button"
                      onClick={() => {
                        const next = `${aiPrompt.trim()} ${refinement.replace(/^Add /i, "")}`.trim();
                        setAiPrompt(next);
                        void runAiSearch(next);
                      }}
                      className="rounded-full border border-(--color-line-strong) px-3 py-1 text-[11px] text-(--color-fg-muted) hover:text-(--color-fg)"
                    >
                      {refinement}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* refreshing indicator */}
        {refreshing ? (
          <div className="flex justify-end">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-(--color-line-strong) border-t-transparent" />
          </div>
        ) : null}

        <details className="group rounded-xl border border-(--color-line) bg-(--color-panel) open:pb-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4 text-(--color-fg-muted)" aria-hidden />
              <span className="text-[14px] font-medium text-(--color-fg)">Refine results</span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-(--color-fg) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-bg)">
                  {activeFilterCount}
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-4 w-4 text-(--color-fg-dim) transition group-open:rotate-180" />
          </summary>

          <div className="space-y-4 px-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--color-line) pb-4">
              <GoalModePicker value={goal} onChange={pickGoal} compact />
              <DietPicker value={diet} onChange={pickDiet} compact />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["daily_staple", "good_choice", "occasional_treat", "skip"] as const).map((v) => {
                const labels: Record<string, string> = {
                  daily_staple: "Daily staples",
                  good_choice: "Good choices",
                  occasional_treat: "Treats",
                  skip: "Skip",
                };
                const colors: Record<string, { fg: string; bg: string; border: string; activeBg: string }> = {
                  daily_staple: { fg: "#0f9e75", bg: "transparent", border: "#0f9e75", activeBg: "color-mix(in srgb, #0f9e75 14%, transparent)" },
                  good_choice: { fg: "#7ab830", bg: "transparent", border: "#7ab830", activeBg: "color-mix(in srgb, #7ab830 14%, transparent)" },
                  occasional_treat: { fg: "#e07030", bg: "transparent", border: "#e07030", activeBg: "color-mix(in srgb, #e07030 14%, transparent)" },
                  skip: { fg: "#d43030", bg: "transparent", border: "#d43030", activeBg: "color-mix(in srgb, #d43030 14%, transparent)" },
                };
                const c = colors[v]!;
                const active = activeState.verdict === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch({ verdict: active ? "" : v })}
                    className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition"
                    style={{
                      borderColor: c.border,
                      color: c.fg,
                      backgroundColor: active ? c.activeBg : c.bg,
                    }}
                  >
                    {labels[v]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => patch({ verdict: "" })}
                className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                  !activeState.verdict
                    ? "font-medium text-(--color-fg)"
                    : "text-(--color-fg-dim) hover:text-(--color-fg-muted)"
                }`}
              >
                All verdicts
              </button>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none">
              <div className="flex w-max items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch({ category: "" })}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
                    !activeState.category
                      ? "bg-(--color-fg) font-medium text-(--color-bg)"
                      : "border border-(--color-line) text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg)"
                  }`}
                >
                  All aisles
                </button>
                {filterOptions.categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch({ category: c })}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
                  activeState.category === c
                    ? "bg-(--color-fg) font-medium text-(--color-bg)"
                    : "border border-(--color-line) text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg)"
                }`}
              >
                {c}
              </button>
                ))}
              </div>
            </div>
            <div className="border-t border-(--color-line) pt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FilterSelect
                  label="Brand"
                  value={activeState.brand}
                  onChange={(e) => patch({ brand: e.target.value })}
                  disabled={!metaReady || !filterOptions.brands.length}
                >
                  <option value="">All brands</option>
                  {filterOptions.brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  label="Min score"
                  value={activeState.minScore || ""}
                  onChange={(e) => patch({ minScore: e.target.value ? Number(e.target.value) : 0 })}
                >
                  <option value="">Any score</option>
                  <option value="40">40+</option>
                  <option value="50">50+</option>
                  <option value="60">60+</option>
                  <option value="70">70+</option>
                </FilterSelect>

                <FilterSelect
                  label="Max price"
                  value={activeState.maxPrice || ""}
                  onChange={(e) => patch({ maxPrice: e.target.value ? Number(e.target.value) : 0 })}
                >
                  <option value="">Any price</option>
                  <option value="100">Under ₹100</option>
                  <option value="200">Under ₹200</option>
                  <option value="500">Under ₹500</option>
                </FilterSelect>

                <FilterSelect
                  label="Type"
                  value={activeState.subcategory}
                  onChange={(e) => patch({ subcategory: e.target.value })}
                  disabled={!metaReady || !filterOptions.subcategories.length}
                >
                  <option value="">All types</option>
                  {filterOptions.subcategories.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  label="Grade"
                  value={activeState.grade}
                  onChange={(e) => patch({ grade: (e.target.value || "") as Grade | "" })}
                >
                  <option value="">Any grade</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </FilterSelect>

                <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-line) bg-(--color-bg) px-3 text-sm text-(--color-fg-muted)">
                  <input
                    type="checkbox"
                    checked={activeState.onlyScored}
                    onChange={(e) => patch({ onlyScored: e.target.checked })}
                    className="h-4 w-4 shrink-0 rounded border-(--color-line-strong) accent-(--color-fg)"
                  />
                  Scored only
                </label>
              </div>
            </div>

          {hasFilters ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-(--color-line) pt-3">
              {activeState.subcategory ? <FilterChip label={activeState.subcategory} onClear={() => patch({ subcategory: "" })} /> : null}
              {activeState.brand ? <FilterChip label={activeState.brand} onClear={() => patch({ brand: "" })} /> : null}
              {activeState.minScore > 0 ? <FilterChip label={`Score ${activeState.minScore}+`} onClear={() => patch({ minScore: 0 })} /> : null}
              {activeState.maxPrice > 0 ? <FilterChip label={`Under ₹${activeState.maxPrice}`} onClear={() => patch({ maxPrice: 0 })} /> : null}
              {activeState.grade ? <FilterChip label={`Grade ${activeState.grade}`} onClear={() => patch({ grade: "" })} /> : null}
              {activeState.onlyScored ? <FilterChip label="Scored only" onClear={() => patch({ onlyScored: false })} /> : null}
              {activeState.sublabel ? <FilterChip label={activeState.sublabel.replace(/_/g, " ")} onClear={() => patch({ sublabel: "" })} /> : null}
              <button type="button" onClick={clearAll} className="ml-auto text-[12px] text-(--color-fg-dim) underline-offset-4 hover:text-(--color-fg) hover:underline">
                Clear all
              </button>
            </div>
          ) : null}
        </div>
        </details>
      </div>

      {/* ── Data-rich landing or product grid ────────────────────────── */}
      {!aiMode && !hasFilters && !factBrowse ? (
        <ScoutLanding
          stats={stats ?? null}
          goal={goal}
          onGoalChange={pickGoal}
          hrefQuery={productQuery}
          onFactAction={(fact) => void handleFactAction(fact)}
        />
      ) : loading && items.length === 0 ? (
        <div className="grid grid-cols-2 items-stretch gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="aspect-square rounded-xl bg-(--color-bg-soft)" />
              <div className="h-4 w-3/4 rounded bg-(--color-bg-soft)" />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <p className="py-16 text-center text-sm text-(--color-fg-muted)">No products match.</p>
      ) : (
        <div className="space-y-4">
          {factBrowse ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] text-(--color-fg-muted)">
                <span className="font-semibold text-(--color-fg)">{factBrowse.total}</span> products ·{" "}
                {factBrowse.headline}
                {factBrowse.total > factBrowse.items.length ? (
                  <span className="text-(--color-fg-dim)"> (showing {factBrowse.items.length})</span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFactBrowse(null);
                  setItems([]);
                  setTotal(0);
                }}
                className="text-[13px] text-(--color-fg-dim) underline-offset-4 hover:text-(--color-fg) hover:underline"
              >
                Back to Scout
              </button>
            </div>
          ) : null}
          <div
            className={`relative grid grid-cols-2 items-stretch gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 ${
              refreshing ? "opacity-80" : "opacity-100"
            } transition-opacity duration-100`}
          >
            {items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                hrefQuery={productQuery}
                goalFit={goal !== "balanced" ? goalFits[p.id] : undefined}
                onSublabelClick={handleSublabelClick}
              />
            ))}
          </div>
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore || refreshing}
            className="rounded-full border border-(--color-line) px-5 py-2 text-sm text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : `Show more (${Math.max(0, total - items.length).toLocaleString()} left)`}
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

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-fg-dim)";
  if (score >= 65) return "var(--color-good)";
  if (score >= 50) return "#7ab830";
  if (score >= 40) return "var(--color-warn)";
  return "var(--color-bad)";
}

function LandingScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  return (
    <span
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[13px] font-bold text-white"
      style={{ backgroundColor: scoreColor(score) }}
    >
      {score}
    </span>
  );
}

function LandingPickCard({ pick, hrefQuery }: { pick: LandingPick; hrefQuery: string }) {
  return (
    <Link
      href={`/product/${pick.slug}${hrefQuery}`}
      onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel) transition hover:border-(--color-fg-dim) hover:shadow-md"
    >
      <div className="relative aspect-square photo-frame">
        {pick.image ? (
          <Image
            src={pick.image}
            alt={pick.name}
            fill
            sizes="(max-width: 640px) 50vw, 220px"
            className="object-contain p-3 transition group-hover:scale-[1.03]"
          />
        ) : null}
        <span className="absolute left-2 top-2">
          <LandingScoreBadge score={pick.score} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {pick.brand ? (
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-(--color-fg-dim)">
            {pick.brand}
          </span>
        ) : null}
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-(--color-fg)">
          {pick.name}
        </span>
        <div className="mt-auto flex items-center justify-between pt-1.5">
          {pick.meta ? (
            <span className="text-[12px] font-semibold text-(--color-fg-muted)">{pick.meta}</span>
          ) : <span />}
          {pick.price != null ? (
            <span className="text-[12px] text-(--color-fg-dim)">₹{pick.price}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function ScoutLanding({
  stats,
  goal,
  onGoalChange,
  hrefQuery,
  onFactAction,
}: {
  stats: { scored: number; visible: number } | null;
  goal: GoalId;
  onGoalChange: (goal: GoalId) => void;
  hrefQuery: string;
  onFactAction: (fact: LandingFact) => void;
}) {
  const [data, setData] = useState<LandingInsights | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLandingInsights()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded && !data) {
    return (
      <div className="space-y-10 pt-2">
        <div className="h-48 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
          ))}
        </div>
      </div>
    );
  }

  const pick = data?.pickOfDay ?? null;
  const facts = data?.facts ?? [];
  const board =
    data?.goalBoards.find((b) => b.goal === goal) ?? data?.goalBoards[0] ?? null;

  return (
    <div className="space-y-12 pt-2">
      {/* C — Scout's pick of the day */}
      {pick ? (
        <section>
          <div className="overflow-hidden rounded-3xl border border-(--color-line) bg-(--color-panel)">
            <div className="grid gap-0 sm:grid-cols-[200px_1fr] md:grid-cols-[260px_1fr]">
              <Link
                href={`/product/${pick.pick.slug}${hrefQuery}`}
                onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
                className="relative aspect-square photo-frame sm:aspect-auto"
              >
                {pick.pick.image ? (
                  <Image
                    src={pick.pick.image}
                    alt={pick.pick.name}
                    fill
                    sizes="260px"
                    className="object-contain p-5"
                  />
                ) : null}
              </Link>
              <div className="flex flex-col justify-center gap-3 p-6 md:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--color-fg-dim)">
                  Scout’s pick of the day
                </p>
                <div className="flex items-start gap-3">
                  <LandingScoreBadge score={pick.pick.score} />
                  <div>
                    {pick.pick.brand ? (
                      <p className="text-[12px] font-medium uppercase tracking-wide text-(--color-fg-dim)">
                        {pick.pick.brand}
                      </p>
                    ) : null}
                    <Link
                      href={`/product/${pick.pick.slug}${hrefQuery}`}
                      onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
                      className="font-display text-xl font-semibold leading-snug text-(--color-fg) hover:underline md:text-2xl"
                    >
                      {pick.pick.name}
                    </Link>
                  </div>
                </div>
                {pick.reasons.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {pick.reasons.map((r) => (
                      <li
                        key={r}
                        className="rounded-full border border-(--color-line-strong) px-3 py-1 text-[12px] text-(--color-fg-muted)"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href={`/product/${pick.pick.slug}${hrefQuery}`}
                  onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
                  className="mt-1 inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-(--color-fg) underline-offset-4 hover:underline"
                >
                  See why it wins <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* B — Myth-busting facts */}
      {facts.length ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-(--color-fg)">
            What Scout found on the shelf
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f) => (
              <button
                key={f.headline}
                type="button"
                onClick={() => onFactAction(f)}
                className="group flex flex-col rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 text-left transition hover:border-(--color-fg-dim) hover:shadow-md"
              >
                <span
                  className="font-display text-3xl font-bold leading-none"
                  style={{
                    color:
                      f.tone === "bad"
                        ? "var(--color-bad)"
                        : f.tone === "good"
                        ? "var(--color-good)"
                        : "var(--color-fg)",
                  }}
                >
                  {f.stat}
                </span>
                <span className="mt-2 text-[13px] leading-relaxed text-(--color-fg-muted)">
                  {f.headline}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-(--color-fg-muted) transition group-hover:gap-1.5 group-hover:text-(--color-fg)">
                  {f.cta} <span aria-hidden>→</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* E — For your goal */}
      {board && data ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-(--color-fg)">
              Best for {board.label.toLowerCase()}
            </h2>
            <span className="text-[12.5px] text-(--color-fg-dim)">{board.tagline}</span>
          </div>

          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {data.goalBoards.map((b) => (
              <button
                key={b.goal}
                type="button"
                onClick={() => onGoalChange(b.goal)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
                  b.goal === board.goal
                    ? "bg-(--color-fg) font-medium text-(--color-bg)"
                    : "border border-(--color-line-strong) text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg)"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
            {board.picks.map((p) => (
              <LandingPickCard key={p.slug} pick={p} hrefQuery={hrefQuery} />
            ))}
          </div>
        </section>
      ) : null}

      {stats ? (
        <p className="pt-2 text-center text-[12px] text-(--color-fg-dim)">
          Scout has read the label on every one of {stats.scored.toLocaleString()} scored products.
        </p>
      ) : null}
    </div>
  );
}
