#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Human-edible aisles only — skip paan, pharma, cleaning, personal care, home, pet.
export GROCERY_RPS="${GROCERY_RPS:-3}"
export GROCERY_BURST="${GROCERY_BURST:-2}"
export SCRAPE_CONCURRENCY="${SCRAPE_CONCURRENCY:-4}"
export SCRAPE_DETAIL_BATCH="${SCRAPE_DETAIL_BATCH:-500}"

FOOD_CATS="dairy__bread__eggs__egg__snacks__munchies__sweet tooth__bakery__biscuit__breakfast__instant food__cold drinks__juices__tea__coffee__health drink__protein__whey__supplement__atta__rice__dal__besan__gram flour__masala__oil__sauce__spread__organic__healthy__chicken__meat__fish__paneer__fruits__vegetables__frozen"

SKIP_CATS="paan__pharma__wellness__personal__cleaning__home__office__pet__stationery__fashion__electronics"

log() { echo "[scrape-5k-food] $*"; }

log "starting — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
pnpm tsx scripts/db-status.ts 2>/dev/null || true

log "listing pass (max 5000 new summaries, deep pages)…"
pnpm tsx scripts/02-scrape-products.ts \
  --only-categories="${FOOD_CATS}" \
  --skip-categories="${SKIP_CATS}" \
  --pages-per-cat=100 \
  --ignore-progress \
  --max-products=5000 \
  2>&1 | tee /tmp/oasis-scrape-5k-listing.log

log "detail pass (all pending PDPs)…"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export PLAYWRIGHT_USE_CHROME="${PLAYWRIGHT_USE_CHROME:-1}"
export GROCERY_RPS="${GROCERY_RPS_DETAIL:-2}"
export GROCERY_BURST="${GROCERY_BURST_DETAIL:-1}"
export SCRAPE_CONCURRENCY="${SCRAPE_CONCURRENCY_DETAIL:-2}"
pnpm tsx scripts/02-scrape-products.ts --detail-only \
  2>&1 | tee /tmp/oasis-scrape-5k-detail.log

log "score new nutrition…"
pnpm score -- --only-unscored 2>&1 | tee -a /tmp/oasis-scrape-5k-detail.log

pnpm tsx scripts/db-status.ts 2>&1
log "done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
