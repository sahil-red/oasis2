#!/usr/bin/env bash
# Backfill DB so production (Vercel) serves fresh scores + slim catalog cache.
set -euo pipefail
cd "$(dirname "$0")/.."

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export PLAYWRIGHT_USE_CHROME="${PLAYWRIGHT_USE_CHROME:-1}"

log() { echo "[vercel-pipeline] $*"; }

log "1/6 staples detail pass (if listing already ran)…"
pnpm tsx scripts/02-scrape-products.ts --detail-only 2>&1 | tee /tmp/oasis-staples-detail.log || true

log "2/6 reparse Blinkit nutrition blocks…"
pnpm reparse:nutrition 2>&1 | tee /tmp/oasis-reparse.log || true

log "3/6 fix implausible nutrition (OCR garbage)…"
pnpm fix:nutrition 2>&1 | tee -a /tmp/oasis-reparse.log || true

log "4/6 seed fresh produce nutrition…"
pnpm seed:produce -- --force 2>&1 | tee /tmp/oasis-produce.log

log "5/6 score catalog (rule v6)…"
pnpm score -- --force 2>&1 | tee /tmp/oasis-score.log

log "6/6 db status…"
pnpm db:status 2>&1

log "done — push to main triggers Vercel; set SCORING_RULE_VERSION=6 on Vercel if not already."
