/**
 * Image preprocessing for OCR.
 *
 * Indian packaged-food back-labels are tough OCR targets: small dense text,
 * shiny foil/cellophane backgrounds, curved bottles, dual-language print.
 * This pipeline gets us a meaningful accuracy bump on Tesseract and a small
 * one on Gemini (which is more robust).
 *
 *   1. Convert to grayscale → removes colour noise.
 *   2. Normalise → stretches contrast across the full 0–255 range.
 *   3. Sharpen → emphasises the printed character edges.
 *   4. Upscale to a known min-width (1600px) if the source is small.
 *
 * We deliberately skip deskew/perspective correction — those hurt more than
 * they help on the slightly-curved labels typical of Indian snack packaging,
 * because the deskew heuristic latches onto the curve and over-rotates.
 */

import sharp from "sharp";

export interface PreprocessOptions {
  /** Minimum width in pixels. Defaults to 1600. */
  minWidth?: number;
  /** Maximum width to avoid OOMs on huge product photos. Defaults to 2400. */
  maxWidth?: number;
}

export async function preprocessForOcr(
  bytes: Buffer,
  opts: PreprocessOptions = {},
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const minWidth = opts.minWidth ?? 1600;
  const maxWidth = opts.maxWidth ?? 2400;

  const base = sharp(bytes, { failOn: "none" }).rotate(); // auto-orient via EXIF

  const meta = await base.metadata();
  const srcWidth = meta.width ?? 0;

  let pipeline = base.grayscale().normalize().sharpen({ sigma: 1 });

  if (srcWidth > 0 && srcWidth < minWidth) {
    pipeline = pipeline.resize({
      width: minWidth,
      kernel: "lanczos3",
      withoutEnlargement: false,
    });
  } else if (srcWidth > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, kernel: "lanczos3" });
  }

  const out = await pipeline.png({ compressionLevel: 6 }).toBuffer({
    resolveWithObject: true,
  });

  return { bytes: out.data, width: out.info.width, height: out.info.height };
}
