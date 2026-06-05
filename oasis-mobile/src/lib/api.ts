import { API_BASE } from "@/lib/config";
import type {
  AiSearchResult,
  CatalogMeta,
  CatalogProduct,
  CatalogSearchResult,
  LandingInsights,
  MeResponse,
  ProductDetail,
  SubscriptionCheckout,
} from "@/types/api";

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: string }).error)
        : `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.status = res.status;
    if (body && typeof body === "object" && "code" in body) {
      err.code = String((body as { code: string }).code);
    }
    throw err;
  }
  return body as T;
}

export function fetchLanding(): Promise<LandingInsights> {
  return apiFetch("/api/landing");
}

export function fetchCatalogMeta(): Promise<CatalogMeta> {
  return apiFetch("/api/catalog/meta");
}

export function fetchCatalogSearch(params: Record<string, string | number>): Promise<CatalogSearchResult> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v !== undefined) sp.set(k, String(v));
  }
  return apiFetch(`/api/catalog/search?${sp.toString()}`);
}

export function fetchProduct(slug: string): Promise<ProductDetail> {
  return apiFetch(`/api/products/${encodeURIComponent(slug)}`);
}

export function fetchProductsBySlugs(slugs: string[]): Promise<CatalogProduct[]> {
  if (!slugs.length) return Promise.resolve([]);
  return apiFetch(`/api/products?slugs=${slugs.map(encodeURIComponent).join(",")}`);
}

export function fetchMe(token: string): Promise<MeResponse> {
  return apiFetch("/api/me", { token });
}

export function fetchAiSearch(
  prompt: string,
  token: string | null,
  limit = 24,
): Promise<AiSearchResult> {
  return apiFetch("/api/search/ai", {
    method: "POST",
    body: JSON.stringify({ prompt, limit }),
    token,
  });
}

export function createSubscription(token: string): Promise<SubscriptionCheckout> {
  return apiFetch("/api/billing/create-subscription", {
    method: "POST",
    token,
  });
}
