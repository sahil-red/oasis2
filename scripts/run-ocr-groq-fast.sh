#!/usr/bin/env bash
# Fast Groq OCR+LM: one small model, many parallel workers, no quota-splitting.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${LM_STUDIO_BASE_URL:=https://api.groq.com/openai/v1}"
: "${LM_STUDIO_FAST_MODEL:=llama-3.1-8b-instant}"
: "${LM_STUDIO_MODELS:=llama-3.1-8b-instant}"
: "${LM_CONCURRENCY:=12}"
: "${LIVETEXT_WORKERS:=6}"

export LM_STUDIO_BASE_URL LM_STUDIO_FAST_MODEL LM_STUDIO_MODELS LM_CONCURRENCY LIVETEXT_WORKERS
# pnpm ocr:lm loads .env.local via dotenv (GROQ_API_KEY → map below in pipeline if needed)

exec caffeinate -dims pnpm ocr:lm -- --all --resume --persist-db --ocr-concurrency=12
