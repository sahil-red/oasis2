#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Faster defaults (~3–4× detail vs GROCERY_RPS=1 serial). Back off if Cloudflare spikes.
export GROCERY_RPS="${GROCERY_RPS:-3}"
export GROCERY_BURST="${GROCERY_BURST:-2}"
export SCRAPE_CONCURRENCY="${SCRAPE_CONCURRENCY:-4}"
export SCRAPE_DETAIL_BATCH="${SCRAPE_DETAIL_BATCH:-500}"

log() { echo "[expand-pipeline] $*"; }

log "starting — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "scrape: rps=$GROCERY_RPS burst=$GROCERY_BURST concurrency=$SCRAPE_CONCURRENCY"
pnpm tsx scripts/db-status.ts 2>/dev/null || true

log "detail pass (parallel, all pending batches)…"
pnpm scrape:expand:detail 2>&1 | tee /tmp/oasis-expand-detail.log

log "score Blinkit nutrition from detail (no OCR wait)…"
pnpm score -- --with-detail --only-unscored 2>&1 | tee -a /tmp/oasis-expand-detail.log

log "OCR — dual Gemini pool + bulk-skip platform data…"
pnpm ocr -- --with-detail 2>&1 | tee /tmp/oasis-ocr-expand.log

log "score products that gained nutrition from OCR…"
pnpm score -- --only-unscored 2>&1 | tee -a /tmp/oasis-ocr-expand.log

pnpm tsx scripts/db-status.ts 2>&1
log "done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
