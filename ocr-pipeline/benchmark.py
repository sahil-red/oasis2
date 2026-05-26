#!/usr/bin/env python3
"""Benchmark cold CLI vs warm server vs one-shot execute_ocr."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from vision_ocr import execute_ocr

ROOT = Path(__file__).resolve().parent


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: benchmark.py <image_path>")
        sys.exit(1)

    image = sys.argv[1]
    py = ROOT / ".venv/bin/python"
    if not py.is_file():
        py = Path(sys.executable)

    print("── in-process (warm import) ──")
    t0 = time.perf_counter()
    r1 = execute_ocr(image, level="fast")
    t1 = time.perf_counter() - t0
    print(f"  wall={t1:.3f}s  inference={r1.get('actual_inference_seconds')}s")

    print("── in-process (2nd call) ──")
    t0 = time.perf_counter()
    r2 = execute_ocr(image, level="fast")
    t1 = time.perf_counter() - t0
    print(f"  wall={t1:.3f}s  inference={r2.get('actual_inference_seconds')}s")

    print("── cold CLI subprocess ──")
    t0 = time.perf_counter()
    subprocess.run(
        [str(py), str(ROOT / "run_ocr.py"), image, "fast"],
        check=True,
        capture_output=True,
    )
    print(f"  wall={time.perf_counter() - t0:.3f}s")

    print("── persistent server (ping + 2 OCR) ──")
    proc = subprocess.Popen(
        [str(py), str(ROOT / "ocr_server.py")],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    t0 = time.perf_counter()
    proc.stdin.write(json.dumps({"cmd": "ping"}) + "\n")
    proc.stdin.flush()
    proc.stdout.readline()
    boot = time.perf_counter() - t0
    print(f"  server boot+ping={boot:.3f}s")

    for i in range(2):
        t0 = time.perf_counter()
        proc.stdin.write(json.dumps({"path": image, "level": "fast"}) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
        data = json.loads(line)
        print(
            f"  ocr[{i + 1}] wall={time.perf_counter() - t0:.3f}s "
            f"inference={data.get('actual_inference_seconds')}s"
        )

    proc.terminate()


if __name__ == "__main__":
    main()
