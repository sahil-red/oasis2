/**
 * Pick the back-label image from a set of product images.
 *
 * Convention on Indian quick-commerce platforms (Blinkit, Zepto, Instamart):
 * images are ordered front → side(s) → back. The back-label is almost
 * always at the LAST index, sometimes the second-to-last (when an MRP/QR
 * shot was added later). We exploit that ordering as the primary signal.
 *
 * For products with ≤2 images we just try them all.
 *
 * Fancier strategies (Gemini Vision classifier, EAST text-region detection)
 * are intentionally not the default — they'd burn API budget on a problem
 * that the ordering convention solves for ~90% of products.
 */

import type { ImagePickResult } from "./types";

export function pickBackLabelCandidates(
  imageUrls: string[],
): ImagePickResult[] {
  if (imageUrls.length === 0) return [];

  if (imageUrls.length === 1) {
    return [
      {
        url: imageUrls[0],
        index: 0,
        reason: "only_image",
        confidence: 0.5,
      },
    ];
  }

  // Always try last → second-to-last → third-to-last in order.
  // Don't bother with the first image; it's almost always front-of-pack.
  const results: ImagePickResult[] = [];
  const candidateCount = Math.min(3, imageUrls.length);
  for (let i = 0; i < candidateCount; i++) {
    const index = imageUrls.length - 1 - i;
    if (index <= 0 && i > 0) break; // don't double-count, don't include front
    results.push({
      url: imageUrls[index],
      index,
      reason: "last_image_heuristic",
      // Highest confidence in the very last image; decay as we go inward.
      confidence: 0.8 - i * 0.2,
    });
  }
  return results;
}
