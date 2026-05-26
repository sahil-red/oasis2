# Scout

Transparent ingredient and nutrition research for the Indian grocery market. We import Zepto's catalog, fill gaps with reference data and label OCR, and compute a transparent Core safety score per product.

## Stack (zero recurring cost)


| Layer       | Tool                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| Frontend    | Next.js 16 (App Router) · Tailwind v4 · Framer Motion                          |
| Backend     | Supabase free tier (Postgres + Auth — **no Storage bucket**, images hotlinked) |
| Scraper     | Modular `lib/grocery` adapter (Blinkit primary; Zepto / Instamart pluggable)   |
| OCR         | Gemini 3.1 Flash-Lite multimodal (free tier) → Tesseract.js local fallback     |
| Scoring LLM | Gemini 3.1 Flash-Lite via `@google/genai` (free tier) or local Ollama          |
| Hosting     | Vercel Hobby (later)                                                           |


## Setup

```bash
# 1. Install pnpm if you haven't (one-time)
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 2. Install deps
pnpm install

# 3. Configure env
cp .env.local.example .env.local
#   - Create a free Supabase project at supabase.com and paste keys
#   - Create a free Gemini API key at aistudio.google.com and paste it
#   - SUPABASE_DB_URL is "Database → Connection string → URI" from Supabase

# 4. Run migrations against your Supabase Postgres
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_ocr.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_product_attributes.sql
# (or paste into the SQL editor in the Supabase dashboard)

# 5. Start the dev server
pnpm dev
```

### Data pipeline (Phases 2–4)

Run these in order. Each is resumable.

```bash
# Warm a Blinkit session. PRIMARY path: Playwright. A real Chromium opens,
# you pick a delivery location, then press ENTER in the terminal. The
# storage state + headers are saved to .cache/blinkit-storage.json +
# .cache/blinkit-session.json. (Cloudflare bot manager rejects every other
# request mechanism — Node fetch, libcurl, system curl — because cf_bm is
# bound to the TLS handshake it was issued under.)
pnpm pw:install               # one-time: download Chromium for Playwright
pnpm warm-session             # opens a real Chromium for sign-in

# Pull the full taxonomy.
pnpm scrape:categories

# Paginate every category for product summaries, then fetch per-SKU detail.
# `--detail` parses the snippet tree at POST /v1/layout/product/<sku> and
# persists structured ingredients + nutrition + attributes (Country of
# Origin, Diet Preference, FSSAI License, Allergen Information, Shelf Life,
# Disclaimer, Seller, …) — i.e. everything Blinkit's PDP shows.
pnpm scrape:products
pnpm scrape:products -- --detail

# OCR the back-label image — only for products where Blinkit didn't already
# give us ingredients + nutrition (the long tail of small / new brands).
# Default backend is "auto": Gemini 3.1 Flash-Lite first, Tesseract.js
# fallback on quota / low confidence. OCR_MAX_CALLS_PER_RUN caps Gemini at
# 400/run by default; re-run across days to cover the long tail, or set
# OCR_BACKEND=tesseract for fully local processing.
pnpm ocr
```

Open [http://localhost:3000](http://localhost:3000).

## Important: nanoid override

`nanoid@3.3.12` was published with a stray `.claude/settings.local.json` (the maintainer's local Claude Code permissions config). Cursor's sandbox correctly blocks writes to any `.claude/` path. We pin to `3.3.11` via `pnpm-workspace.yaml`:

```yaml
overrides:
  "nanoid@3.3.12": "3.3.11"
```

Do not remove this until upstream republishes a clean 3.3.13+.

## Repo Layout

```
app/                          Next.js App Router
  page.tsx                    Landing
  search/page.tsx             Catalog browse  (Phase 5)
  product/[slug]/page.tsx     Product detail  (Phase 5)
  blog/page.tsx               Research        (Phase 6)
  api/                        Route handlers
components/                   ScoreRing, StatCard, FeatureStep, Faq, Section
lib/
  supabase/{client,admin,types}.ts
  scoring/                    Core engine     (Phase 4)
  grocery/                    Platform-agnostic scraper SDK
    types.ts                  Canonical interfaces (Platform, GrocerySession, ScrapedProduct…)
    http.ts                   Throttled, retrying fetch wrapper
    session.ts                Cookie persistence + cURL import
    blinkit.ts                Blinkit adapter (primary)
    index.ts                  Adapter registry
  ocr/                        Image → structured ingredients + nutrition + qty
    types.ts                  OcrPayload schema
    hash.ts                   SHA-256 cache key
    preprocess.ts             sharp pipeline
    picker.ts                 Pick the back-label image
    gemini.ts                 Gemini Vision (responseSchema-bounded JSON)
    tesseract.ts              Tesseract.js + regex parsers (fallback)
    cache.ts                  image_ocr_cache R/W
    index.ts                  Orchestrator
  utils.ts                    cn(), grade helpers
scripts/                      One-shot pipeline scripts
  00-warm-session.ts          Capture a usable grocery session (cURL or Playwright)
  01-scrape-categories.ts     Taxonomy → zepto_taxonomy + raw JSONL
  02-scrape-products.ts       Summary + (--detail) detail pass
  03-ocr-labels.ts            OCR back-labels → products.ocr_payload
data/
  ingredient-rules.json       Curated penalties (Phase 4)
supabase/migrations/          SQL migrations
```

## Scoring model — Yuka-inspired, three subscores summing to 100

`final = clamp(0, 100, nutrition_60 + additives_30 + labels_10)`
…subject to a hard cap of **49** if any *hazardous*-tier additive is present (so an ultra-processed product can never be "Good", no matter the macros).

### Nutrition (0–60) — category-anchored

Each Zepto subcategory has a `[floor, ceiling]` band in [data/category-baselines.json](data/category-baselines.json), keyed by the literal `"<category>::<subcategory>"` strings Zepto returns. Bands encode how whole the category is — Fresh Paneer 70–95, Whole Wheat Atta 70–95, Potato Chips 15–55, Carbonated Drinks 5–30 — so a best-in-class chip can never beat an average paneer.

Inside the band, per-100 g nutrients are **rank-normalized against the other products in the same subcategory**, with category-specific signed weights (paneer rewards protein and penalizes saturated fat + sodium; chips penalize fat + sodium and reward fiber). The result is mapped into the band, then scaled to the 0–60 axis.

### Additives (0–30) — category-agnostic

Starts at 30. Each ingredient is matched against [data/ingredient-rules.json](data/ingredient-rules.json), which uses a Yuka-style 4-tier system (`risk-free`, `limited`, `moderate`, `hazardous`). Penalties accumulate per occurrence; a single hazardous additive zeroes the axis AND triggers the global 49-cap. Unknown ingredients are sent to Gemini Flash-Lite (free tier) for a one-shot tier classification, cached forever in `llm_cache`.

### Labels (0–10) — bonus

Small bonuses for verified labels: India Organic / Jaivik Bharat / FSSAI Organic (+5), single-ingredient (+2), no palm oil declaration (+2), no added sugar (+1). Capped at 10.

### Presentation

- **0–100 numeric score** displayed in the big ring.
- **A–F letter grade** as a chip (A 85+, B 70+, C 55+, D 40+, F <40).
- **Color band** drives the ring + UI accents — Bad/Poor/Good/Excellent at 0–25 / 26–50 / 51–75 / 76–100 (Yuka thresholds).
- Two horizontal subscore bars below the ring: **Nutrition** and **Additives**, each color-coded.

Worked example:


| Product                              | Nutrition / 60 | Additives / 30      | Labels / 10 | Total  | Grade · Band  |
| ------------------------------------ | -------------- | ------------------- | ----------- | ------ | ------------- |
| Premium paneer 22 g protein 16 g fat | 55             | 30                  | 5 (organic) | **90** | A · Excellent |
| Average paneer 18 g protein 22 g fat | 49             | 30                  | 0           | **79** | B · Excellent |
| Baked "healthy" chips                | 28             | 27 (−3 palm)        | 0           | **55** | C · Good      |
| Regular masala chips                 | 16             | 14 (MSG + colour)   | 0           | **30** | F · Poor      |
| Soft drink with aspartame + colour   | 18             | 0 (hazardous → cap) | 0           | **18** | F · Bad       |


## Phased delivery

- **Phase 1** — Scaffold + landing page + DB schema ✓
- **Phase 2** — Grocery SDK + Playwright session warmer + category/product scrapers + Blinkit PDP parser ✓
- **Phase 3** — OCR back-label pipeline (fallback for SKUs without platform-supplied ingredients) ✓
- **Phase 4** — Rules + category baselines + two-axis Core scoring engine + Gemini classifier for unknown ingredients
- **Phase 5** — Catalog search + product detail UI
- **Phase 6** — Blog (MDX) + auth + polish

### Source-of-truth table

| Field              | Primary source                 | Fallback                            |
| ------------------ | ------------------------------ | ----------------------------------- |
| Per-100g nutrition | Blinkit PDP (`b_image_text_3`) | OCR on back-label, then OFF         |
| Ingredients (with %) | Blinkit PDP (high-volume SKUs) | OCR on back-label                   |
| Net qty / serve    | Blinkit `cart_item.unit`       | OCR                                 |
| FSSAI license      | Blinkit PDP                    | OCR                                 |
| Country of Origin, Diet Preference, Allergens, Shelf Life, Seller, … | Blinkit `products.attributes` | — |
| Images             | Blinkit `carousal_list_vr`     | —                                   |
| Category taxonomy  | Blinkit `/v1/layout/categories` | —                                   |

## Free-tier limits to know

- **Supabase**: 500 MB Postgres, no Storage usage (we don't store images)
- **Gemini 3.1 Flash-Lite**: rate-limited via `p-throttle` (default 10 RPM / 500 RPD; see `.env.local`). The OCR orchestrator also enforces `OCR_MAX_CALLS_PER_RUN` (default 400) as a per-process safety valve.
- **Tesseract.js**: runs locally, unlimited. Set `OCR_BACKEND=tesseract` to do the entire OCR pass with zero cloud calls (lower accuracy on glossy / curved labels).
- **image_ocr_cache**: keyed on bytes, so re-runs are free. Plan to OCR ~1500 unique back-labels/day on auto and ramp across ~7 days for a 10 k-product seed.

## Legal

This project scrapes Indian quick-commerce platforms (Blinkit primary, others pluggable) for personal research. Their ToS prohibit automated access. We do **not** redistribute scraped images or pricing — images are hotlinked from the platform's CDN, and product cards link back to the originating site. Open Food Facts data, if used as an optional cross-check, is shown with CC-BY-SA attribution in the footer.

## Acknowledgements

- [Open Food Facts](https://world.openfoodfacts.org/) for the ingredient & nutrition reference data
- [shadcn/ui](https://ui.shadcn.com/) for the design patterns

