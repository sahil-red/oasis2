#!/usr/bin/env bash
# Wait, then start ocr:lm (solo — will wait if rate:ingredients is still running).
#
#   ./scripts/schedule-ocr-lm-later.sh --hours=10
#   ./scripts/schedule-ocr-lm-later.sh --hours=10 --limit=2000
#
# Log: /tmp/oasis-ocr-lm-scheduled.log

set -euo pipefail
cd "$(dirname "$0")/.."

HOURS=10
LIMIT=2000
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hours=*) HOURS="${1#*=}"; shift ;;
    --limit=*) LIMIT="${1#*=}"; shift ;;
    --hours) HOURS="${2:-10}"; shift 2 ;;
    --limit) LIMIT="${2:-2000}"; shift 2 ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

SECS=$((HOURS * 3600))
LOG="${OASIS_OCR_SCHED_LOG:-/tmp/oasis-ocr-lm-scheduled.log}"
PIDFILE="${OASIS_OCR_SCHED_PIDFILE:-/tmp/oasis-ocr-lm-scheduled.pid}"

echo "[schedule-ocr] will start in ${HOURS}h ($(date -v+${HOURS}H 2>/dev/null || date -d "+${HOURS} hours" 2>/dev/null || echo 'local time + hours'))" | tee -a "$LOG"
echo "[schedule-ocr] log=$LOG pidfile=$PIDFILE" | tee -a "$LOG"

(
  sleep "$SECS"
  echo "[schedule-ocr] wake $(date)" >>"$LOG"
  while pgrep -f "scripts/rate-ingredients.ts" >/dev/null 2>&1; do
    echo "[schedule-ocr] waiting for rate:ingredients to finish… $(date)" >>"$LOG"
    sleep 300
  done
  if pgrep -f "scripts/ocr-lm-pipeline.ts" >/dev/null 2>&1; then
    echo "[schedule-ocr] ocr:lm already running — exit" >>"$LOG"
    exit 0
  fi
  echo "[schedule-ocr] starting ocr:lm --limit=$LIMIT --resume --persist-db" >>"$LOG"
  if ((${#EXTRA[@]} > 0)); then
    exec caffeinate -dims pnpm ocr:lm -- --limit="$LIMIT" --resume --persist-db "${EXTRA[@]}"
  else
    exec caffeinate -dims pnpm ocr:lm -- --limit="$LIMIT" --resume --persist-db
  fi
) >>"$LOG" 2>&1 &

echo $! >"$PIDFILE"
echo "[schedule-ocr] scheduler pid=$(cat "$PIDFILE") (parent shell backgrounded)"
echo "  tail -f $LOG"
echo "  cancel: kill \$(cat $PIDFILE) 2>/dev/null; pkill -f schedule-ocr-lm-later"
