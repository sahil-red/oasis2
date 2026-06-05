export type VerdictId = "daily_staple" | "good_choice" | "occasional_treat" | "skip";

export type CoreScoreSummary = {
  score: number;
  grade: string;
  band: string;
  verdict: string | null;
  verdict_sublabels: string[];
  relative_score: number | null;
  cohort_size: number | null;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
  image_urls: string[];
  core_scores: CoreScoreSummary | null;
  deepseek_chips?: string[];
  deepseek_why?: string | null;
  ai_match_score?: number;
  ai_match_reasons?: string[];
  ai_match_warning?: string | null;
};

export type CatalogSearchResult = {
  items: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type CatalogMeta = {
  stats: { visible: number; scored: number; zepto: number };
  filters: {
    categories: string[];
    subcategories: string[];
    brands: string[];
    usecases: string[];
  };
};

export type ProductNutrition = {
  sugar_g_100g?: number;
  added_sugar_g_100g?: number;
  protein_g_100g?: number;
  fat_g_100g?: number;
  fiber_g_100g?: number;
  energy_kcal_100g?: number;
  sodium_mg_100g?: number;
};

export type ProductDetail = CatalogProduct & {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  deepseek_why?: string | null;
  deepseek_chips?: string[];
  attributes: Record<string, string> | null;
  verdict_resolved: VerdictId | null;
  core_scores: CoreScoreSummary & {
    subscores?: { nutrition: number; additives: number; labels: number };
    concerns?: Array<{ type: string; message: string; severity: string }>;
    breakdown?: Record<string, unknown>;
  } | null;
};

export type AiSearchResult = {
  summary: string;
  items: CatalogProduct[];
  parsed: unknown;
  parse_source: string;
  rank_source: string;
  relaxed: boolean;
  refinements: string[];
};

export type LandingPick = {
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  score: number | null;
  grade?: string | null;
  verdict?: string | null;
  price: number | null;
  meta?: string | null;
};

export type LandingFactAction =
  | { type: "expose"; slugs: string[] }
  | { type: "catalog"; sublabel?: string; verdict?: string; sort?: string }
  | { type: "ai_search"; prompt: string };

export type LandingFact = {
  stat: string;
  headline: string;
  tone: "bad" | "good" | "neutral";
  action: LandingFactAction;
  cta: string;
};

export type LandingGoalBoard = {
  goal: string;
  label: string;
  tagline: string;
  picks: LandingPick[];
};

export type LandingBestInClassProduct = {
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  score: number;
  grade: string | null;
  protein: number | null;
  sugar: number | null;
};

export type LandingBestInClassCategory = {
  label: string;
  href: string;
  avgScore: number;
  skipPct: number;
  products: LandingBestInClassProduct[];
};

export type LandingDodgeProduct = {
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  score: number;
  claim: string;
  reality: string;
};

export type LandingInsights = {
  totalScored: number;
  avgScore: number;
  facts: LandingFact[];
  pickOfDay: { pick: LandingPick; reasons: string[] } | null;
  goalBoards: LandingGoalBoard[];
  bestInClass: LandingBestInClassCategory[];
  dodgeList: LandingDodgeProduct[];
};

export type SwapSuggestion = {
  slug: string;
  name: string;
  brand: string | null;
  image_urls: string[];
  price_inr: number | null;
  core_scores: CoreScoreSummary | null;
  delta_score: number;
  reason: string;
};

export type SwapsResponse = {
  goal: string;
  swaps: Record<string, SwapSuggestion[]>;
};

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  plan: "free" | "plus";
  ai_searches_remaining: number;
  ai_searches_limit: number;
};

export type MeResponse = {
  user: { id: string; email?: string; phone?: string };
  profile: UserProfile;
};

export type SubscriptionCheckout = {
  subscription_id: string;
  checkout_url: string | null;
  key_id: string;
  plan: { name: string; amount_display: string; interval: string };
};
