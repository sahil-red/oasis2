"""
Legacy Tesseract-style preprocess only — NOT used by Apple Vision.

OpenCV Otsu binarization destroys anti-aliased edges that Vision relies on.
Use vision_ocr.execute_ocr() on raw images instead.
"""

from __future__ import annotations

import cv2
import numpy as np


def preprocess_for_ocr(bgr: np.ndarray, target_height: int = 800) -> np.ndarray:
    h, w = bgr.shape[:2]
    if h != target_height:
        scale = target_height / float(h)
        new_w = max(1, int(round(w * scale)))
        bgr = cv2.resize(bgr, (new_w, target_height), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


def preprocess_file(input_path: str, output_path: str, target_height: int = 800) -> None:
    bgr = cv2.imread(input_path)
    if bgr is None:
        raise FileNotFoundError(f"could not read image: {input_path}")
    out = preprocess_for_ocr(bgr, target_height=target_height)
    if not cv2.imwrite(output_path, out):
        raise RuntimeError(f"could not write: {output_path}")
