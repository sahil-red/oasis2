# Apple Vision OCR pipeline

Fast label OCR on macOS using [ocrmac](https://github.com/straussmaximilian/ocrmac) (Apple Vision).

## Important: do not binarize for Vision

**Do not** run OpenCV Otsu / resize preprocess before Vision. That path was for Tesseract-style engines. Vision expects raw color or natural grayscale JPEG/PNG with anti-aliased text.

## Setup

```bash
pnpm ocr:setup
```

## Architecture

| File | Role |
|------|------|
| `vision_ocr.py` | Core `execute_ocr(path)` — raw image, timed inference |
| `ocr_server.py` | Persistent worker (stdin/stdout JSONL) — avoids 1–2s PyObjC cold start per image |
| `run_ocr.py` | One-shot CLI for debugging |
| `benchmark.py` | Compare cold CLI vs warm server vs in-process |

Node calls `ocr_server.py` via `lib/ocr/vision-mac.ts` (one Python process per `pnpm ocr:audit` run).

## Benchmark

```bash
ocr-pipeline/.venv/bin/python ocr-pipeline/benchmark.py /path/to/label.jpg
```

Expect **~0.05–0.20s** `actual_inference_seconds` on warm server; cold CLI includes ~1–2s framework load.

## Run

```bash
pnpm ocr:sample
pnpm ocr:audit -- --all --persist-db --resume
pnpm ocr:rollup
```
