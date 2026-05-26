#!/usr/bin/env bash
# Long-running OCR+LM catalog job in tmux (survives terminal close; keeps going if Mac stays awake).
#
# Usage:
#   chmod +x scripts/run-ocr-lm-tmux.sh
#   ./scripts/run-ocr-lm-tmux.sh
#
# Attach:  tmux attach -t oasis-ocr-lm
# Detach:  Ctrl-b then d
# Logs:    tail -f /tmp/oasis-ocr-lm-full.log

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="oasis-ocr-lm"
LOG="/tmp/oasis-ocr-lm-full.log"

cd "$ROOT"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attach with: tmux attach -t $SESSION"
  exit 0
fi

tmux new-session -d -s "$SESSION" -c "$ROOT" \
  "pnpm ocr:lm -- --all --resume --persist-db 2>&1 | tee -a $LOG"

echo "Started tmux session: $SESSION"
echo "  attach: tmux attach -t $SESSION"
echo "  log:    tail -f $LOG"
echo ""
echo "Note: macOS sleep may pause the job unless caffeinate is used:"
echo "  caffeinate -dimsu tmux attach -t $SESSION"
