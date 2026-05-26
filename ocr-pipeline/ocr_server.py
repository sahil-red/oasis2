#!/usr/bin/env python3
"""
Persistent Vision OCR worker — amortizes PyObjC / ocrmac cold start.

Protocol (stdin/stdout, one JSON object per line):
  → {"path": "/abs/image.jpg", "level": "fast"}
  ← {"backend": "apple_vision_native", "actual_inference_seconds": 0.12, ...}

  → {"cmd": "ping"}
  ← {"ok": true, "backend": "apple_vision_native"}
"""

from __future__ import annotations

import json
import sys

from vision_ocr import execute_ocr


def main() -> None:
    # Warm import path (ocrmac + Vision frameworks already loaded in this process).
    sys.stderr.write("[ocr_server] ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"invalid json: {e}"}), flush=True)
            continue

        if req.get("cmd") == "ping":
            print(json.dumps({"ok": True, "backend": "apple_vision_native"}), flush=True)
            continue

        path = req.get("path")
        if not path:
            print(json.dumps({"error": "missing path"}), flush=True)
            continue

        level = req.get("level", "fast")
        print(json.dumps(execute_ocr(path, level=level), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
