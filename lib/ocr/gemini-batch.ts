import { Agent, fetch as undiciFetch } from "undici";
import type { AppleRawOcrProduct } from "@/lib/ocr/apple-raw";
import type { ZeptoCsvRow } from "@/lib/zepto-import/csv-row";
import {
  DEEPSEEK_LABEL_SYSTEM_PROMPT,
  buildDeepseekPromptContext,
  normalizeExtracted,
  validateExtractedLabel,
  DeepseekExtractionError,
  type ExtractedLabel,
  type ValidationResult,
} from "@/lib/ocr/deepseek-label-extract";

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const dispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 300_000,
  headersTimeout: 60_000,
});

export type GeminiBatchOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokensPerProduct?: number;
  timeoutMs?: number;
};

export type BatchProductResult = {
  zepto_sku: string;
  name: string;
  model: string;
  extracted: ExtractedLabel;
  validation: ValidationResult;
  raw_response: string;
  usage: null;
  response_metadata: { batch_index: number; batch_size: number } | null;
  prompt_chars: number;
  at: string;
  error?: undefined;
};

export type BatchProductError = {
  zepto_sku: string;
  name: string;
  error: string;
  at: string;
};

export type BatchItem = {
  row: ZeptoCsvRow;
  raw: AppleRawOcrProduct;
};

const PRODUCT_START = "<<<PRODUCT_START>>>";
const PRODUCT_END = "<<<PRODUCT_END>>>";

const BATCH_SYSTEM_PROMPT = `${DEEPSEEK_LABEL_SYSTEM_PROMPT}

BATCH MODE
You will receive multiple products separated by === PRODUCT N of M === markers.
For each product output its JSON object wrapped in delimiters like this:

${PRODUCT_START}
{"schema_version":2, ...}
${PRODUCT_END}

Rules:
- Output exactly M delimiter-wrapped JSON objects in the same order as the products.
- No text outside the delimiters. No markdown. No arrays. No explanation.
- Every JSON value that is a string must have all special characters properly escaped.`;

function buildBatchUserPrompt(items: BatchItem[]): { prompt: string; evidenceMaps: Map<string, unknown>[] } {
  const parts: string[] = [
    `Extract labels for the following ${items.length} products. Wrap each product's JSON in ${PRODUCT_START} / ${PRODUCT_END} delimiters.\n`,
  ];
  const evidenceMaps: Map<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const { row, raw } = items[i]!;
    const prefix = `p${i}_`;
    const ctx = buildDeepseekPromptContext({ product: row, raw, evidencePrefix: prefix });
    evidenceMaps.push(ctx.evidenceById);
    parts.push(`=== PRODUCT ${i + 1} of ${items.length} | SKU: ${row.zepto_sku} ===`);
    parts.push(ctx.prompt);
  }

  return { prompt: parts.join("\n\n"), evidenceMaps };
}

/**
 * Parse delimiter-wrapped products from the model response.
 * Each product is wrapped in <<<PRODUCT_START>>> / <<<PRODUCT_END>>> so
 * a JSON error in one product never affects the others.
 */
function extractDelimitedObjects(raw: string): Array<unknown | null> {
  const results: Array<unknown | null> = [];
  let searchFrom = 0;
  while (true) {
    const startIdx = raw.indexOf(PRODUCT_START, searchFrom);
    if (startIdx < 0) break;
    const contentStart = startIdx + PRODUCT_START.length;
    const endIdx = raw.indexOf(PRODUCT_END, contentStart);
    const chunk = endIdx >= 0
      ? raw.slice(contentStart, endIdx).trim()
      : raw.slice(contentStart).trim();

    // Strip markdown fences if model wrapped in ```
    const fenced = chunk.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced?.[1]?.trim() ?? chunk;

    try {
      results.push(JSON.parse(jsonText));
    } catch {
      results.push(null); // malformed — caller marks as error
    }
    searchFrom = endIdx >= 0 ? endIdx + PRODUCT_END.length : raw.length;
  }
  return results;
}

function stripPrefix(obj: unknown, prefix: string): unknown {
  if (typeof obj === "string") {
    return obj.startsWith(prefix) ? obj.slice(prefix.length) : obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => stripPrefix(v, prefix));
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, stripPrefix(v, prefix)]),
    );
  }
  return obj;
}

export async function extractBatchWithGemini(
  items: BatchItem[],
  opts: GeminiBatchOptions,
): Promise<Array<BatchProductResult | BatchProductError>> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, "");
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const maxTokens = (opts.maxTokensPerProduct ?? 1200) * items.length;
  const { prompt, evidenceMaps } = buildBatchUserPrompt(items);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);

  let rawBody: string;
  try {
    const endpoint = `${baseUrl}/chat/completions`;
    const res = await undiciFetch(endpoint, {
      method: "POST",
      dispatcher,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: BATCH_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
    rawBody = await res.text();
    if (!res.ok) {
      let msg = rawBody;
      try { msg = (JSON.parse(rawBody) as { error?: { message?: string } }).error?.message ?? rawBody; } catch { /* keep */ }
      throw new Error(`Gemini ${res.status}: ${msg.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  const parsed = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> };
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new DeepseekExtractionError("Gemini returned no content");

  const parsed_objects = extractDelimitedObjects(content);
  if (parsed_objects.length === 0) {
    throw new DeepseekExtractionError(
      `Gemini returned no delimited objects (got ${content.length} chars)`,
      { rawResponse: content },
    );
  }
  if (parsed_objects.length < items.length) {
    console.warn(`  [recover] got ${parsed_objects.length}/${items.length} objects from response`);
  }

  const results: Array<BatchProductResult | BatchProductError> = [];
  const now = new Date().toISOString();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const element = parsed_objects[i];
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      results.push({
        zepto_sku: item.row.zepto_sku,
        name: item.row.name,
        error: `Batch element ${i} is missing or not an object`,
        at: now,
      });
      continue;
    }
    try {
      // Strip the per-product evidence prefix before normalization
      const unprefixed = stripPrefix(element, `p${i}_`) as Record<string, unknown>;
      const evidenceById = evidenceMaps[i]!;
      // Remap evidenceById to un-prefixed keys for normalizeExtracted
      const unprefixedEvidenceById = new Map(
        [...(evidenceById as Map<string, unknown>).entries()].map(([k, v]) => [
          k.startsWith(`p${i}_`) ? k.slice(`p${i}_`.length) : k,
          v,
        ]),
      );
      const extracted = normalizeExtracted(
        unprefixed,
        item.row,
        unprefixedEvidenceById as Map<string, Parameters<typeof normalizeExtracted>[2] extends Map<string, infer V> ? V : never>,
      );
      const validation = validateExtractedLabel(extracted);
      results.push({
        zepto_sku: item.row.zepto_sku,
        name: item.row.name,
        model,
        extracted,
        validation,
        raw_response: JSON.stringify(element),
        usage: null,
        response_metadata: { batch_index: i, batch_size: items.length },
        prompt_chars: BATCH_SYSTEM_PROMPT.length + prompt.length,
        at: now,
      });
    } catch (e) {
      results.push({
        zepto_sku: item.row.zepto_sku,
        name: item.row.name,
        error: `Parse failed for batch element ${i}: ${(e as Error).message}`,
        at: now,
      });
    }
  }

  return results;
}
