#!/usr/bin/env bash
# Run ingredient LM rating overnight — survives terminal close + lid close (with caffeinate).
# Usage:
#   ./scripts/run-rate-ingredients-detached.sh
#   ./scripts/run-rate-ingredients-detached.sh -- --limit=500 --batch-size=8
#
# Reattach logs:  tail -f /tmp/oasis-rate-ingredients.log
# Status:         pnpm lm:status

set -euo pipefail
cd "$(dirname "$0")/.."

LOG="${OASIS_RATE_LOG:-/tmp/oasis-rate-ingredients.log}"
PIDFILE="${OASIS_RATE_PIDFILE:-/tmp/oasis-rate-ingredients.pid}"
CAFFPIDFILE="${OASIS_RATE_CAFFPIDFILE:-/tmp/oasis-rate-ingredients.caffeinate.pid}"

if pgrep -f "scripts/rate-ingredients.ts" >/dev/null 2>&1; then
  echo "rate:ingredients already running. Log: $LOG"
  pgrep -fl "scripts/rate-ingredients.ts" || true
  exit 0
fi

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in $(pwd)"
  exit 1
fi

echo "Starting rate:ingredients under caffeinate (log → $LOG)"
echo "Plug in AC power. Screensaver is OK; system sleep is blocked until the job exits."
# -d display sleep, -i idle sleep, -m disk sleep, -s system sleep (while plugged in, -s is safe)
# Local JSONL per batch; Supabase upload once at end (see ingredient-rate-checkpoint.ts)
nohup caffeinate -dims pnpm rate:ingredients -- --all --batch-size=8 "$@" >>"$LOG" 2>&1 &
CAFF_PID=$!
echo "$CAFF_PID" >"$CAFFPIDFILE"
sleep 4

JOB_PID=$(pgrep -f "scripts/rate-ingredients.ts" | head -1 || true)
if [[ -z "$JOB_PID" ]]; then
  echo "Failed to start — check $LOG"
  tail -30 "$LOG"
  exit 1
fi
echo "$JOB_PID" >"$PIDFILE"

echo "OK caffeinate_pid=$CAFF_PID job_pid=$JOB_PID"
if pmset -g batt 2>/dev/null | grep -q "AC Power"; then
  echo "Power: AC (good for overnight)"
else
  echo "WARNING: not on AC — plug in before closing lid"
fi
pmset -g 2>/dev/null | grep -E "sleep|displaysleep" || true
echo "  tail -f $LOG"
echo "  pnpm lm:status"
echo "Plug in power. On return: tmux attach -t oasis-lm  (if you created that session)"
