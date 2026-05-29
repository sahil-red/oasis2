import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  visionRawFromPath,
  type VisionOcrLine,
  type VisionOcrResult,
} from "@/lib/ocr/vision-mac";

export type AppleOcrVariantName =
  | "original"
  | "gray_normalized_sharp"
  | "highres_gray_normalized_sharp"
  | "bw_threshold";

export type AppleOcrVariantMode = "adaptive" | "all";

export type AppleRawOcrVariant = {
  variant: AppleOcrVariantName;
  status: "success" | "failed";
  image_sha256: string | null;
  width: number | null;
  height: number | null;
  recognition_level: "fast" | "accurate";
  backend: string | null;
  avg_confidence: number | null;
  actual_inference_seconds: number | null;
  raw_text: string;
  lines: VisionOcrLine[];
  error?: string;
};

export type AppleRawOcrQuality = {
  low_confidence: boolean;
  best_variant: AppleOcrVariantName | null;
  best_avg_confidence: number | null;
  best_text_chars: number;
  attempted_variants: AppleOcrVariantName[];
  reasons: string[];
};

export type AppleRawOcrImage = {
  index: number;
  url: string;
  status: "success" | "failed";
  source_image_sha256: string | null;
  source_width: number | null;
  source_height: number | null;
  variants: AppleRawOcrVariant[];
  quality: AppleRawOcrQuality;
  error?: string;
};

export type AppleRawOcrProduct = {
  schema_version: 1;
  backend: "apple_vision_raw";
  generated_at: string;
  image_count: number;
  variant_policy: {
    mode: AppleOcrVariantMode;
    recognition_level: "fast" | "accurate";
    variants: AppleOcrVariantName[];
    min_confidence: number;
    min_text_chars: number;
    note: string;
  };
  low_confidence_image_count: number;
  images: AppleRawOcrImage[];
  combined_text: string;
};

const ALL_VARIANTS: AppleOcrVariantName[] = [
  "original",
  "gray_normalized_sharp",
  "highres_gray_normalized_sharp",
  "bw_threshold",
];
const FALLBACK_VARIANTS: AppleOcrVariantName[] = ALL_VARIANTS.filter(
  (variant) => variant !== "original",
);

const DEFAULT_MIN_CONFIDENCE = 0.85;
const DEFAULT_MIN_TEXT_CHARS = 40;

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; ScoutOCR/1.0)" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        lastError = new Error(`image fetch ${res.status}`);
        if (res.status < 500 && res.status !== 429) throw lastError;
      } else {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (e) {
      lastError = e;
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(3, attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function imageSize(bytes: Buffer): Promise<{ width: number | null; height: number | null }> {
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  return { width: meta.width ?? null, height: meta.height ?? null };
}

async function variantBytes(
  source: Buffer,
  variant: AppleOcrVariantName,
): Promise<Buffer> {
  if (variant === "original") return source;

  const meta = await sharp(source, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const base = sharp(source, { failOn: "none" }).rotate().grayscale();

  if (variant === "gray_normalized_sharp") {
    return base
      .median(1)
      .normalize()
      .sharpen({ sigma: 0.8 })
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  if (variant === "highres_gray_normalized_sharp") {
    const targetWidth = width > 0 && width < 2200 ? 2200 : Math.min(width || 2200, 3200);
    return base
      .resize({ width: targetWidth, kernel: "lanczos3", withoutEnlargement: false })
      .median(1)
      .normalize()
      .sharpen({ sigma: 0.8 })
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  return base
    .normalize()
    .sharpen({ sigma: 0.8 })
    .threshold(170)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

function tempImagePath(tempDir: string, imageIndex: number, variant: AppleOcrVariantName): string {
  return join(tempDir, `image-${String(imageIndex).padStart(2, "0")}-${variant}.png`);
}

async function ocrVariant(params: {
  sourceBytes: Buffer;
  imageIndex: number;
  variant: AppleOcrVariantName;
  tempDir: string;
  recognitionLevel: "fast" | "accurate";
}): Promise<AppleRawOcrVariant> {
  const { sourceBytes, imageIndex, variant, tempDir, recognitionLevel } = params;
  try {
    const bytes = await variantBytes(sourceBytes, variant);
    const { width, height } = await imageSize(bytes);
    const path = tempImagePath(tempDir, imageIndex, variant);
    await writeFile(path, bytes);
    const raw = await visionRawFromPath(path, recognitionLevel);
    return {
      variant,
      status: "success",
      image_sha256: sha256(bytes),
      width,
      height,
      recognition_level: recognitionLevel,
      backend: raw.backend,
      avg_confidence: raw.avg_confidence ?? null,
      actual_inference_seconds: raw.actual_inference_seconds ?? null,
      raw_text: raw.full_text ?? "",
      lines: raw.lines ?? [],
    };
  } catch (e) {
    return {
      variant,
      status: "failed",
      image_sha256: null,
      width: null,
      height: null,
      recognition_level: recognitionLevel,
      backend: null,
      avg_confidence: null,
      actual_inference_seconds: null,
      raw_text: "",
      lines: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function textChars(variant: AppleRawOcrVariant): number {
  return variant.raw_text.trim().length;
}

function variantPassesQuality(
  variant: AppleRawOcrVariant,
  opts: { minConfidence: number; minTextChars: number },
): boolean {
  return (
    variant.status === "success" &&
    textChars(variant) >= opts.minTextChars &&
    (variant.avg_confidence ?? 0) >= opts.minConfidence
  );
}

function bestVariant(variants: AppleRawOcrVariant[]): AppleRawOcrVariant | null {
  const successful = variants.filter((variant) => variant.status === "success");
  if (!successful.length) return null;
  return successful
    .slice()
    .sort((a, b) => {
      const confDelta = (b.avg_confidence ?? 0) - (a.avg_confidence ?? 0);
      if (Math.abs(confDelta) > 0.02) return confDelta;
      return textChars(b) - textChars(a);
    })[0]!;
}

function imageQuality(
  variants: AppleRawOcrVariant[],
  opts: { minConfidence: number; minTextChars: number },
): AppleRawOcrQuality {
  const best = bestVariant(variants);
  const reasons: string[] = [];
  if (!best) {
    reasons.push("no_successful_variant");
  } else {
    if (textChars(best) < opts.minTextChars) reasons.push("low_text_chars");
    if ((best.avg_confidence ?? 0) < opts.minConfidence) reasons.push("low_avg_confidence");
  }

  return {
    low_confidence: reasons.length > 0,
    best_variant: best?.variant ?? null,
    best_avg_confidence: best?.avg_confidence ?? null,
    best_text_chars: best ? textChars(best) : 0,
    attempted_variants: variants.map((variant) => variant.variant),
    reasons,
  };
}

async function ocrImage(params: {
  url: string;
  index: number;
  tempDir: string;
  recognitionLevel: "fast" | "accurate";
  variantMode: AppleOcrVariantMode;
  minConfidence: number;
  minTextChars: number;
}): Promise<AppleRawOcrImage> {
  const {
    url,
    index,
    tempDir,
    recognitionLevel,
    variantMode,
    minConfidence,
    minTextChars,
  } = params;
  try {
    const source = await fetchImageBytes(url);
    const sourceSha = sha256(source);
    const { width, height } = await imageSize(source);
    const variants: AppleRawOcrVariant[] = [];

    const original = await ocrVariant({
      sourceBytes: source,
      imageIndex: index,
      variant: "original",
      tempDir,
      recognitionLevel,
    });
    variants.push(original);

    const qualityOpts = { minConfidence, minTextChars };
    if (variantMode === "all" || !variantPassesQuality(original, qualityOpts)) {
      for (const variant of FALLBACK_VARIANTS) {
        const result = await ocrVariant({
          sourceBytes: source,
          imageIndex: index,
          variant,
          tempDir,
          recognitionLevel,
        });
        variants.push(result);
        if (variantMode === "adaptive" && variantPassesQuality(result, qualityOpts)) break;
      }
    }

    const quality = imageQuality(variants, qualityOpts);
    return {
      index,
      url,
      status: variants.some((v) => v.status === "success") ? "success" : "failed",
      source_image_sha256: sourceSha,
      source_width: width,
      source_height: height,
      variants,
      quality,
    };
  } catch (e) {
    const quality: AppleRawOcrQuality = {
      low_confidence: true,
      best_variant: null,
      best_avg_confidence: null,
      best_text_chars: 0,
      attempted_variants: [],
      reasons: ["image_fetch_or_decode_failed"],
    };
    return {
      index,
      url,
      status: "failed",
      source_image_sha256: null,
      source_width: null,
      source_height: null,
      variants: [],
      quality,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function combinedText(images: AppleRawOcrImage[]): string {
  return images
    .flatMap((image) =>
      image.variants.map((variant) => {
        const text = variant.raw_text.trim();
        return [
          `--- image ${image.index} | ${variant.variant} | ${image.url} ---`,
          text || "[no text]",
        ].join("\n");
      }),
    )
    .join("\n\n");
}

export async function runAppleRawOcr(params: {
  imageUrls: string[];
  tempDir: string;
  recognitionLevel?: "fast" | "accurate";
  imageConcurrency?: number;
  variantMode?: AppleOcrVariantMode;
  minConfidence?: number;
  minTextChars?: number;
}): Promise<AppleRawOcrProduct> {
  const recognitionLevel = params.recognitionLevel ?? "accurate";
  const variantMode = params.variantMode ?? "adaptive";
  const minConfidence = params.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minTextChars = params.minTextChars ?? DEFAULT_MIN_TEXT_CHARS;
  const concurrency = Math.max(1, Math.min(8, params.imageConcurrency ?? 2));
  await mkdir(params.tempDir, { recursive: true });

  const images: AppleRawOcrImage[] = new Array(params.imageUrls.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= params.imageUrls.length) return;
      images[index] = await ocrImage({
        url: params.imageUrls[index]!,
        index,
        tempDir: params.tempDir,
        recognitionLevel,
        variantMode,
        minConfidence,
        minTextChars,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, params.imageUrls.length) }, () => worker()),
  );

  const lowConfidenceImageCount = images.filter((image) => image.quality.low_confidence).length;

  return {
    schema_version: 1,
    backend: "apple_vision_raw",
    generated_at: new Date().toISOString(),
    image_count: params.imageUrls.length,
    variant_policy: {
      mode: variantMode,
      recognition_level: recognitionLevel,
      variants: ALL_VARIANTS,
      min_confidence: minConfidence,
      min_text_chars: minTextChars,
      note: "Raw OCR capture only. Adaptive mode runs the original image first and only escalates preprocessing when OCR confidence/text volume is weak. No image selection, regex extraction, label filters, or product-field normalization.",
    },
    low_confidence_image_count: lowConfidenceImageCount,
    images,
    combined_text: combinedText(images),
  };
}
