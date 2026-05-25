#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[pipeline] waiting for any in-flight OCR (pid 54375)…"
while ps -p 54375 >/dev/null 2>&1; do
  pnpm tsx scripts/db-status.ts 2>/dev/null || true
  sleep 60
done

echo "[pipeline] OCR pass 2 — remaining pending…"
pnpm ocr 2>&1 | tee /tmp/oasis-ocr-pass2.log

echo "[pipeline] re-score after OCR…"
pnpm score -- --force 2>&1

pnpm tsx scripts/db-status.ts 2>&1
echo "[pipeline] done."
