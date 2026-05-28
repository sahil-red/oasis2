import { hasLabelKeywords, labelSignalScore, rawTextHasIngredientsLine } from "@/lib/ocr/label-signals";
import { livetextFromUrl } from "@/lib/ocr/livetext-mac";

const OCR_CONCURRENCY = 3;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function livetextBestLabel(urls: string[]): Promise<{
  text: string;
  imageUrl: string;
} | null> {
  if (!urls.length) return null;

  const unique = [...new Set(urls.filter(Boolean))];
  const frames: { text: string; imageUrl: string; score: number; hasIng: boolean }[] = [];
  let lastErr: string | null = null;
  let emptyFrames = 0;
  let ocrFailures = 0;

  const ocrResults = await mapPool(unique, OCR_CONCURRENCY, async (url) => {
    try {
      const { full_text } = await livetextFromUrl(url);
      return { url, full_text, error: null as string | null };
    } catch (e) {
      return {
        url,
        full_text: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  for (const r of ocrResults) {
    if (r.error) {
      ocrFailures++;
      lastErr = r.error;
      continue;
    }
    if (!r.full_text.trim()) {
      emptyFrames++;
      continue;
    }
    if (!hasLabelKeywords(r.full_text)) continue;
    frames.push({
      text: r.full_text,
      imageUrl: r.url,
      score: labelSignalScore(r.full_text),
      hasIng: rawTextHasIngredientsLine(r.full_text),
    });
  }

  const withIngredients = frames.filter((f) => f.hasIng);
  const pool = withIngredients.length ? withIngredients : frames;

  if (pool.length) {
    pool.sort((a, b) => b.score - a.score);
    const best = pool[0]!;
    return { text: best.text, imageUrl: best.imageUrl };
  }

  for (const r of ocrResults) {
    if (r.error || !r.full_text.trim()) continue;
    return { text: r.full_text, imageUrl: r.url };
  }

  if (lastErr) {
    throw new Error(
      `livetext failed on ${unique.length} image(s): ${lastErr} (empty=${emptyFrames} errors=${ocrFailures})`,
    );
  }
  throw new Error(
    `no OCR text from any image (${unique.length} frames, all empty — likely front-of-pack only)`,
  );
}
