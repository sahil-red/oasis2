#!/usr/bin/env python3
"""One-shot Apple Vision OCR — raw image in, JSON on stdout."""

from __future__ import annotations

import json
import sys

from vision_ocr import execute_ocr


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: run_ocr.py <image_path> [fast|accurate]"}))
        sys.exit(1)

    level = (sys.argv[2] if len(sys.argv) > 2 else "fast").strip().lower()
    result = execute_ocr(sys.argv[1], level=level)
    if result.get("error"):
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
