"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
  prefetchCatalogSearch,
  type CatalogGridItem,
  type CatalogMetaResponse,
} from "@/lib/products/catalog-api";
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
import type { CatalogFilters, CatalogSearchResult } from "@/lib/products/queries";
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
    <div className="space-y-8">
      <div className="space-y-5">
        <div ref={goalSentinelRef} className="h-px w-full shrink-0" aria-hidden />

        <section className="rounded-3xl border border-(--color-line) bg-(--color-panel) p-5 shadow-sm md:p-7">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--color-fg-dim)">
              Scout AI search
            </p>
            <h1 className="font-display mt-2 text-3xl leading-tight text-(--color-fg) md:text-4xl">
              Tell Scout what you need.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-(--color-fg-muted)">
              Ask in plain English. Scout parses your request, applies nutrition and ingredient rules, then ranks products with match reasons.
            </p>
          </div>

          <form
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-(--color-line) bg-(--color-bg-soft) p-3 md:flex-row md:items-center"
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
              className="min-h-12 flex-1 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 text-[15px] text-(--color-fg) outline-none transition placeholder:text-(--color-fg-dim) focus:border-(--color-fg-muted)"
            />
            <button
              type="submit"
              disabled={aiSearching || !aiPrompt.trim()}
              className="min-h-12 rounded-xl bg-(--color-fg) px-5 text-sm font-semibold text-(--color-bg) transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiSearching ? "Searching…" : "Find products"}
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
                className="rounded-full border border-(--color-line) px-3 py-1.5 text-[12px] text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg)"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-(--color-fg-dim)">
            <span>
              Free AI searches today: {aiUsage ? `${aiUsage.count}/${aiUsage.limit}` : `0/10`}
            </span>
            <span className="hidden h-3 w-px bg-(--color-line) sm:inline-block" aria-hidden />
            <span>Paid plan: unlimited searches, saved preferences, family profiles, and basket swaps.</span>
          </div>
          {savedPrefs && preferencesToPrompt(savedPrefs) ? (
            <p className="mt-2 text-[12px] text-(--color-fg-muted)">
              Using saved preferences: {preferencesToPrompt(savedPrefs).replace(/^Saved preferences:\s*/i, "").replace(/\.$/, "")}
            </p>
          ) : null}

          {aiMode && aiSummary ? (
            <div className="mt-5 rounded-2xl border border-(--color-line) bg-(--color-bg) px-4 py-3">
              <p className="text-sm font-medium text-(--color-fg)">{aiSummary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--color-fg-dim)">
                <span>Parser: {aiParseSource === "deepseek" ? "DeepSeek" : "local fallback"}</span>
                {aiWarning ? <span>{aiWarning}</span> : null}
              </div>
              {aiParsed ? (
                <button
                  type="button"
                  onClick={() => {
                    const prefs = preferencesFromParsed(aiParsed);
                    writeAiSearchPreferences(prefs);
                    setSavedPrefs(prefs);
                  }}
                  className="mt-3 rounded-full border border-(--color-line) px-3 py-1.5 text-[11px] font-medium text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg)"
                >
                  Save these preferences
                </button>
              ) : null}
              {aiRefinements.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {aiRefinements.map((refinement) => (
                    <button
                      key={refinement}
                      type="button"
                      onClick={() => {
                        const next = `${aiPrompt.trim()} ${refinement.replace(/^Add /i, "")}`.trim();
                        setAiPrompt(next);
                        void runAiSearch(next);
                      }}
                      className="rounded-full bg-(--color-bg-soft) px-3 py-1 text-[11px] text-(--color-fg-muted) hover:text-(--color-fg)"
                    >
                      {refinement}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── Sticky search + sort row ─────────────────────────────────── */}
        <div className="sticky top-14 z-40 -mx-5 border-b border-(--color-line)/60 bg-(--color-bg)/95 px-5 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex items-center gap-3">
            {/* search */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-dim)"
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
                placeholder="Advanced browse by name or brand…"
                autoComplete="off"
                spellCheck={false}
                className="w-full min-w-0 appearance-none rounded-full border border-(--color-line) bg-(--color-panel) py-2 pl-9 pr-3 text-[14px] text-(--color-fg) outline-none transition placeholder:text-(--color-fg-dim) focus:border-(--color-fg-muted)"
              />
            </div>

            {/* sort */}
            <details className="group relative shrink-0">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-(--color-line) px-3.5 text-[13px] font-medium text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg) [&::-webkit-details-marker]:hidden">
                <span className="hidden sm:inline">Sort:</span>
                <span className="text-(--color-fg)">{sortBarLabel(activeState.sort)}</span>
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
              </summary>
              <ul className="absolute right-0 top-full z-40 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel) py-1 shadow-xl">
                {CATALOG_BAR_SORT_OPTIONS.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className={`w-full px-4 py-2 text-left text-sm transition hover:bg-(--color-bg-soft) ${
                        activeState.sort === o.id ? "font-medium text-(--color-fg)" : "text-(--color-fg-muted)"
                      }`}
                      onClick={() => patch({ sort: o.id })}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            </details>

            {/* refreshing indicator */}
            {refreshing ? (
              <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-(--color-line-strong) border-t-transparent" />
            ) : null}
          </div>

          {/* Goal + diet, on the same sticky bar but smaller */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <GoalModePicker value={goal} onChange={pickGoal} compact />
            <DietPicker value={diet} onChange={pickDiet} compact />
          </div>
        </div>

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
          </div>
        </details>

        {/* ── Active filter chips ─────────────────────────────────────── */}
        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
              Filters:
            </span>
            {activeState.subcategory ? (
              <FilterChip label={activeState.subcategory} onClear={() => patch({ subcategory: "" })} />
            ) : null}
            {activeState.brand ? (
              <FilterChip label={activeState.brand} onClear={() => patch({ brand: "" })} />
            ) : null}
            {activeState.minScore > 0 ? (
              <FilterChip label={`Score ${activeState.minScore}+`} onClear={() => patch({ minScore: 0 })} />
            ) : null}
            {activeState.maxPrice > 0 ? (
              <FilterChip label={`Under ₹${activeState.maxPrice}`} onClear={() => patch({ maxPrice: 0 })} />
            ) : null}
            {activeState.grade ? (
              <FilterChip label={`Grade ${activeState.grade}`} onClear={() => patch({ grade: "" })} />
            ) : null}
            {activeState.onlyDeepseek ? (
              <FilterChip label="DeepSeek label extracted" onClear={() => patch({ onlyDeepseek: false })} />
            ) : null}
            {activeState.onlyLabelResolved ? (
              <FilterChip label="Label ≠ CSV" onClear={() => patch({ onlyLabelResolved: false })} />
            ) : null}
            {activeState.onlyScored ? (
              <FilterChip label="Scored only" onClear={() => patch({ onlyScored: false })} />
            ) : null}
            {activeState.sublabel ? (
              <FilterChip label={activeState.sublabel.replace(/_/g, " ")} onClear={() => patch({ sublabel: "" })} />
            ) : null}
            {activeState.q.trim() ? (
              <FilterChip label={`"${activeState.q.trim()}"`} onClear={() => patch({ q: "" })} />
            ) : null}
            <button
              type="button"
              onClick={clearAll}
              className="text-[12px] text-(--color-fg-dim) underline-offset-4 hover:text-(--color-fg) hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {/* ── More filters drawer ─────────────────────────────────────── */}
        <details
          className="group rounded-xl border border-(--color-line) bg-(--color-panel) open:pb-4"
          open={undefined}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4 text-(--color-fg-muted)" aria-hidden />
              <span className="text-[14px] font-medium text-(--color-fg)">More filters</span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-(--color-fg) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-bg)">
                  {activeFilterCount}
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-4 w-4 text-(--color-fg-dim) transition group-open:rotate-180" />
          </summary>

          <div className="space-y-4 px-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FilterSelect
                label="Brand"
                value={activeState.brand}
                onChange={(e) => patch({ brand: e.target.value })}
                disabled={!metaReady || !filterOptions.brands.length}
              >
                <option value="">All brands</option>
                {filterOptions.brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Min score"
                value={activeState.minScore || ""}
                onChange={(e) =>
                  patch({ minScore: e.target.value ? Number(e.target.value) : 0 })
                }
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
                onChange={(e) =>
                  patch({ maxPrice: e.target.value ? Number(e.target.value) : 0 })
                }
              >
                <option value="">Any price</option>
                <option value="100">Under ₹100</option>
                <option value="200">Under ₹200</option>
                <option value="500">Under ₹500</option>
              </FilterSelect>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FilterSelect
                label="Type"
                value={activeState.subcategory}
                onChange={(e) => patch({ subcategory: e.target.value })}
                disabled={!metaReady || !filterOptions.subcategories.length}
              >
                <option value="">All types</option>
                {filterOptions.subcategories.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Usecase"
                value={activeState.usecase}
                onChange={(e) => patch({ usecase: e.target.value })}
                disabled={!metaReady || !filterOptions.usecases.length}
              >
                <option value="">All usecases</option>
                {filterOptions.usecases.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
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

              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-line) bg-(--color-bg) px-3 text-sm text-(--color-fg-muted)">
                <input
                  type="checkbox"
                  checked={activeState.onlyLabelResolved}
                  onChange={(e) => patch({ onlyLabelResolved: e.target.checked })}
                  className="h-4 w-4 shrink-0 rounded border-(--color-line-strong) accent-(--color-fg)"
                />
                Label ≠ CSV
              </label>

              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-line) bg-(--color-bg) px-3 text-sm text-(--color-fg-muted)">
                <input
                  type="checkbox"
                  checked={activeState.onlyDeepseek}
                  onChange={(e) => patch({ onlyDeepseek: e.target.checked })}
                  className="h-4 w-4 shrink-0 rounded border-(--color-line-strong) accent-(--color-fg)"
                />
                DeepSeek label extracted
              </label>
            </div>
          </div>

          {hasFilters ? (
            <div className="mt-3 px-4">
              <button
                type="button"
                onClick={clearAll}
                className="text-[13px] text-(--color-fg-dim) underline-offset-2 transition hover:text-(--color-fg) hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : null}
        </details>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 items-stretch gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
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
          className={`relative grid grid-cols-2 items-stretch gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 ${
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
