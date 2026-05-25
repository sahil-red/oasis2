#!/usr/bin/env bash
# Deep scrape for staples often missing from broad category passes: eggs, chicken, besan, protein.
set -euo pipefail
cd "$(dirname "$0")/.."

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export PLAYWRIGHT_USE_CHROME="${PLAYWRIGHT_USE_CHROME:-1}"
export GROCERY_RPS="${GROCERY_RPS:-3}"
export GROCERY_BURST="${GROCERY_BURST:-2}"

STAPLES="egg__eggs__chicken__meat__fish__besan__gram flour__protein powder__whey__atta__dal__paneer"

log() { echo "[scrape-staples] $*"; }

log "listing (keyword categories + dairy/meat aisles)…"
pnpm tsx scripts/02-scrape-products.ts \
  --only-categories="dairy__bread__eggs__chicken__meat__fish__atta__rice__dal__masala__organic__healthy" \
  --skip-categories="paan__pharma__personal__cleaning__home__pet" \
  --pages-per-cat=80 \
  --ignore-progress \
  --max-products=1500 \
  2>&1 | tee /tmp/oasis-scrape-staples-listing.log

log "detail pass…"
export GROCERY_RPS="${GROCERY_RPS_DETAIL:-2}"
export SCRAPE_CONCURRENCY="${SCRAPE_CONCURRENCY_DETAIL:-2}"
pnpm tsx scripts/02-scrape-products.ts --detail-only 2>&1 | tee /tmp/oasis-scrape-staples-detail.log

log "re-score (rule v3)…"
pnpm score -- --only-unscored 2>&1 | tee -a /tmp/oasis-scrape-staples-detail.log
pnpm tsx scripts/05-compute-scores.ts -- --force 2>&1 | tee -a /tmp/oasis-scrape-staples-detail.log || true

pnpm tsx scripts/db-status.ts 2>&1
log "done"
