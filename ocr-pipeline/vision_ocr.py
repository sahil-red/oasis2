"""Apple Vision OCR — raw images only (no OpenCV / Otsu)."""

from __future__ import annotations

import time
from pathlib import Path

from ocrmac import ocrmac


def execute_ocr(image_path: str, level: str = "fast") -> dict:
    """
    Run ocrmac on the original image file.
    Do not binarize or resize — Vision expects natural anti-aliased text.
    """
    img_path = str(Path(image_path).expanduser().resolve())
    if level not in ("fast", "accurate"):
        level = "fast"

    if not Path(img_path).is_file():
        return {"error": f"file not found: {img_path}"}

    t0 = time.perf_counter()
    text_data = ocrmac.text_from_image(img_path, recognition_level=level)
    elapsed = time.perf_counter() - t0

    lines = []
    for item in text_data:
        text = item[0] if len(item) > 0 else ""
        conf = float(item[1]) if len(item) > 1 else 0.0
        bbox = item[2] if len(item) > 2 else None
        if text:
            lines.append({"text": text, "confidence": conf, "bbox": bbox})

    full_text = "\n".join(l["text"] for l in lines)
    confs = [l["confidence"] for l in lines if l["confidence"] > 0]
    avg_conf = sum(confs) / len(confs) if confs else 0.0

    return {
        "backend": "apple_vision_native",
        "recognition_level": level,
        "actual_inference_seconds": round(elapsed, 4),
        "lines": lines,
        "full_text": full_text,
        "avg_confidence": avg_conf,
    }
