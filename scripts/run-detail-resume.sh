#!/usr/bin/env bash
# Resume PDP detail for all products missing raw_payload (nutrition/images).
set -euo pipefail
cd "$(dirname "$0")/.."

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export PLAYWRIGHT_USE_CHROME="${PLAYWRIGHT_USE_CHROME:-1}"
export GROCERY_RPS="${GROCERY_RPS:-2}"
export GROCERY_BURST="${GROCERY_BURST:-1}"
export SCRAPE_CONCURRENCY="${SCRAPE_CONCURRENCY:-2}"
export SCRAPE_DETAIL_BATCH="${SCRAPE_DETAIL_BATCH:-500}"

log() { echo "[detail-resume] $*"; }

log "starting — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
pnpm tsx scripts/db-status.ts 2>/dev/null || true

log "detail pass (rps=$GROCERY_RPS concurrency=$SCRAPE_CONCURRENCY)…"
pnpm tsx scripts/02-scrape-products.ts --detail-only 2>&1 | tee /tmp/oasis-detail-resume.log

log "score products with new nutrition…"
pnpm score -- --only-unscored 2>&1 | tee -a /tmp/oasis-detail-resume.log

pnpm tsx scripts/db-status.ts 2>&1
log "done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
