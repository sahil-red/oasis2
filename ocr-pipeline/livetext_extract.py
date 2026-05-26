#!/usr/bin/env python3
"""
Apple LiveText line-level OCR.

One-shot CLI:
  livetext_extract.py /path/to/image.jpg

Persistent worker (stdin/stdout JSONL):
  livetext_extract.py --server
  → {"cmd": "ping"}
  ← {"ok": true, "framework": "livetext"}
  → {"path": "/abs/image.jpg"}
  ← {"ok": true, "full_text": "...", "framework": "livetext", "unit": "line"}
"""

from __future__ import annotations

import json
import sys

from ocrmac import ocrmac


def extract_lines(image_path: str) -> str:
    annotations = ocrmac.OCR(
        image_path, framework="livetext", unit="line"
    ).recognize()
    lines: list[str] = []
    for item in annotations:
        if isinstance(item, tuple):
            text = (item[0] or "").strip()
        elif isinstance(item, str):
            text = item.strip()
        else:
            text = str(item).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def handle_request(req: dict) -> dict:
    if req.get("cmd") == "ping":
        return {"ok": True, "framework": "livetext", "unit": "line"}

    path = req.get("path") or req.get("image_path")
    if not path:
        return {"ok": False, "error": "missing path"}

    try:
        text = extract_lines(path)
        return {
            "ok": True,
            "full_text": text,
            "framework": "livetext",
            "unit": "line",
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def run_server() -> int:
    sys.stderr.write("[livetext_server] ready\n")
    sys.stderr.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"ok": False, "error": f"invalid json: {exc}"}), flush=True)
            continue
        print(json.dumps(handle_request(req), ensure_ascii=False), flush=True)
    return 0


def run_cli(path: str) -> int:
    result = handle_request({"path": path})
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "--server":
        return run_server()
    if len(sys.argv) >= 2:
        return run_cli(sys.argv[1])
    print(json.dumps({"ok": False, "error": "usage: livetext_extract.py <path> | --server"}))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
