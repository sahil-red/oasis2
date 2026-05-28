#!/usr/bin/env bash
# Phase 1 + 3 cutover: per-serve backfill → v9 diff sanity → full V9 rescore.
#   ./scripts/run-v9-cutover.sh
# Log: /tmp/oasis-v9-cutover.log

set -euo pipefail
cd "$(dirname "$0")/.."

LOG="${OASIS_V9_CUTOVER_LOG:-/tmp/oasis-v9-cutover.log}"

exec >>"$LOG" 2>&1
echo "=== v9 cutover start $(date) ==="

pnpm backfill:per-serve
pnpm score:v9:diff -- --limit=500

export SCORING_ENGINE=v9
export SCORING_RULE_VERSION=9
pnpm score -- --force

echo "=== v9 cutover done $(date) ==="
