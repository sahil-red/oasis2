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

export type LandingInsights = {
  totalScored: number;
  avgScore: number;
  facts: Array<{
    stat: string;
    headline: string;
    tone: string;
    cta: string;
    action: { type: string; prompt?: string; slugs?: string[] };
  }>;
  pickOfDay: {
    pick: {
      slug: string;
      name: string;
      brand: string | null;
      image: string | null;
      score: number | null;
      price: number | null;
    };
    reasons: string[];
  } | null;
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
