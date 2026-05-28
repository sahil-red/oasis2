#!/usr/bin/env bash
# Optional tmux session to watch LM job logs (job itself runs via nohup + caffeinate).
set -euo pipefail
SESSION=oasis-lm
LOG="${OASIS_RATE_LOG:-/tmp/oasis-rate-ingredients.log}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not installed. Use: tail -f $LOG"
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux attach -t "$SESSION"
else
  tmux new-session -d -s "$SESSION" "tail -f $LOG"
  echo "Created tmux session '$SESSION' — attaching…"
  tmux attach -t "$SESSION"
fi
