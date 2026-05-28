/**
 * LM Studio model settings (ingredient rater only):
 * - Context length: **8192** (not 39k). A batch of 8 uses ~1–2k tokens; 8k leaves headroom.
 *   Lower KV cache → often ~10–20% faster generation on Apple Silicon; negligible quality impact.
 * - OCR / label structure jobs need a separate loaded model or higher context (16k+).
 */
import { withLmStudioLock } from "@/lib/lm/studio-lock";
import { extractJsonObject } from "@/lib/ocr/lm-studio-structure";
import { INGREDIENT_BATCH_JSON_SCHEMA } from "@/lib/scoring/ingredient-lm-schema";

const DEFAULT_BASE = "http://127.0.0.1:1234/v1";
const DEFAULT_MODEL = "qwen2.5coder7b:2";

export type IngredientRole =
  | "base_food"
  | "sweetener"
  | "fat"
  | "starch"
  | "thickener"
  | "emulsifier"
  | "preservative"
  | "color"
  | "flavor"
  | "acid_regulator"
  | "probiotic"
  | "vitamin_mineral"
  | "other";

export type ConcernTier = "innocuous" | "watchful" | "problematic" | "hazardous";

export type IngredientIntelligenceRow = {
  normalized_name: string;
  display_name: string | null;
  nova_class: number;
  role: IngredientRole;
  concern_tier: ConcernTier;
  concern_reasons: string[];
  intrinsic_quality: number;
  synonyms: string[];
};

const SYSTEM_PROMPT = `Rate each grocery ingredient (India). Return JSON only: {"ingredients":[...]} — one object per input, same order.

Fields: normalized_name (match input), display_name, nova_class 1-4, role (base_food|sweetener|fat|starch|thickener|emulsifier|preservative|color|flavor|acid_regulator|probiotic|vitamin_mineral|other), concern_tier (innocuous|watchful|problematic|hazardous), concern_reasons (max 2 short strings), intrinsic_quality 0-100, synonyms (array, optional).`;

const LM_RETRY_SUFFIX =
  "\n\nReturn ONE JSON object only. No code fences. No explanation after the closing brace.";

export class IngredientLlmParseError extends Error {
  readonly rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = "IngredientLlmParseError";
    this.rawResponse = rawResponse;
  }
}

const VALID_ROLES = new Set<IngredientRole>([
  "base_food",
  "sweetener",
  "fat",
  "starch",
  "thickener",
  "emulsifier",
  "preservative",
  "color",
  "flavor",
  "acid_regulator",
  "probiotic",
  "vitamin_mineral",
  "other",
]);

const VALID_TIERS = new Set<ConcernTier>([
  "innocuous",
  "watchful",
  "problematic",
  "hazardous",
]);

function lmEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

/** Extract first balanced `{ ... }` starting at an index (handles trailing model chatter). */
function extractBalancedObject(raw: string, startIdx: number): string | null {
  if (startIdx < 0 || raw[startIdx] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(startIdx, i + 1);
    }
  }
  return null;
}

function repairJsonBlob(blob: string): string {
  return blob.replace(/,\s*([\]}])/g, "$1");
}

function parseIngredientsBlob(blob: string): Record<string, unknown>[] | null {
  const cleaned = repairJsonBlob(blob.trim());
  try {
    const parsed = JSON.parse(cleaned) as {
      ingredients?: Record<string, unknown>[];
    };
    if (Array.isArray(parsed.ingredients)) return parsed.ingredients;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  } catch {
    const arrMatch = cleaned.match(/"ingredients"\s*:\s*(\[[\s\S]*\])\s*[,}]?/);
    if (arrMatch?.[1]) {
      try {
        const arr = JSON.parse(repairJsonBlob(arrMatch[1])) as Record<string, unknown>[];
        if (Array.isArray(arr)) return arr;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Scan every `{` and parse the first balanced object that contains `ingredients`. */
function parseIngredientResponse(content: string): Record<string, unknown>[] {
  const haystacks: string[] = [content.trim()];
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fence) {
    for (const block of fence) {
      const inner = block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim();
      if (inner) haystacks.unshift(inner);
    }
  }

  let lastErr: unknown;
  for (const hay of haystacks) {
    for (let i = 0; i < hay.length; i++) {
      if (hay[i] !== "{") continue;
      const blob = extractBalancedObject(hay, i);
      if (!blob || !/"ingredients"\s*:/.test(blob)) continue;
      try {
        const list = parseIngredientsBlob(blob);
        if (list?.length) return list;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  const fallback = extractJsonObject(content);
  try {
    const list = parseIngredientsBlob(fallback);
    if (list?.length) return list;
  } catch (e) {
    lastErr = e;
  }

  const msg =
    lastErr instanceof Error
      ? lastErr.message
      : "Could not parse ingredient JSON from LM response";
  throw new IngredientLlmParseError(msg, content);
}

function coerceRow(raw: Record<string, unknown>, fallbackName: string): IngredientIntelligenceRow | null {
  const name =
    typeof raw.normalized_name === "string"
      ? raw.normalized_name.trim().toLowerCase()
      : fallbackName;
  if (!name) return null;

  const nova = Number(raw.nova_class);
  const quality = Number(raw.intrinsic_quality);
  const roleRaw = String(raw.role ?? "other").toLowerCase() as IngredientRole;
  const tierRaw = String(raw.concern_tier ?? "innocuous").toLowerCase() as ConcernTier;

  return {
    normalized_name: name,
    display_name:
      typeof raw.display_name === "string" ? raw.display_name.trim() : name,
    nova_class: Number.isFinite(nova) && nova >= 1 && nova <= 4 ? Math.round(nova) : 3,
    role: VALID_ROLES.has(roleRaw) ? roleRaw : "other",
    concern_tier: VALID_TIERS.has(tierRaw) ? tierRaw : "watchful",
    concern_reasons: Array.isArray(raw.concern_reasons)
      ? raw.concern_reasons.map(String).slice(0, 3)
      : [],
    intrinsic_quality: Number.isFinite(quality)
      ? Math.max(0, Math.min(100, Math.round(quality)))
      : 50,
    synonyms: Array.isArray(raw.synonyms) ? raw.synonyms.map(String).slice(0, 5) : [],
  };
}

type ResponseFormat =
  | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: object } }
  | { type: "json_object" }
  | null;

function responseFormatChain(useSchema: boolean): ResponseFormat[] {
  if (!useSchema) return [null];
  return [
    {
      type: "json_schema",
      json_schema: {
        name: "ingredient_batch",
        strict: true,
        schema: INGREDIENT_BATCH_JSON_SCHEMA,
      },
    },
    { type: "json_object" },
    null,
  ];
}

function isResponseFormatRejected(status: number, errBody: string): boolean {
  return (
    status === 400 &&
    /response_format|json_schema|json_object|grammar|schema/i.test(errBody)
  );
}

async function callLmForIngredients(
  baseUrl: string,
  model: string,
  maxTokens: number,
  signal: AbortSignal,
  userContent: string,
  useStructuredOutput: boolean,
): Promise<string> {
  const baseBody: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };

  let lastErr = "";
  for (const fmt of responseFormatChain(useStructuredOutput)) {
    const body = { ...baseBody };
    if (fmt) body.response_format = fmt;

    const res = await fetch(lmEndpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      lastErr = errText.slice(0, 300);
      if (fmt && isResponseFormatRejected(res.status, errText)) continue;
      throw new Error(`LM Studio ${res.status}: ${lastErr}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LM Studio returned empty content");
    return content;
  }

  throw new Error(`LM Studio: no supported response_format (${lastErr})`);
}

function rowsFromParsedList(
  names: string[],
  list: Record<string, unknown>[],
): IngredientIntelligenceRow[] {
  const byName = new Map<string, Record<string, unknown>>();
  for (const raw of list) {
    const key =
      typeof raw.normalized_name === "string"
        ? raw.normalized_name.trim().toLowerCase()
        : "";
    if (key) byName.set(key, raw);
  }

  const out: IngredientIntelligenceRow[] = [];
  for (let i = 0; i < names.length; i++) {
    const key = names[i]!.toLowerCase().trim();
    const raw = byName.get(key) ?? list[i];
    if (!raw) continue;
    const row = coerceRow(raw as Record<string, unknown>, key);
    if (row) {
      row.normalized_name = key;
      out.push(row);
    }
  }
  return out;
}

function throwParseError(content: string, cause: unknown): never {
  const msg =
    cause instanceof Error
      ? cause.message
      : "Could not parse ingredient JSON from LM response";
  throw new IngredientLlmParseError(msg, content);
}

const RETRY_SUB_BATCH = 4;
const MAX_FILL_DEPTH = 6;

function keyName(name: string): string {
  return name.toLowerCase().trim();
}

function missingFromChunk(
  chunk: string[],
  rows: IngredientIntelligenceRow[],
): string[] {
  const got = new Set(rows.map((r) => keyName(r.normalized_name)));
  return chunk.filter((n) => !got.has(keyName(n)));
}

function mergeRows(
  acc: IngredientIntelligenceRow[],
  rows: IngredientIntelligenceRow[],
): void {
  const index = new Map(acc.map((r, i) => [keyName(r.normalized_name), i]));
  for (const row of rows) {
    const k = keyName(row.normalized_name);
    const i = index.get(k);
    if (i !== undefined) acc[i] = row;
    else {
      index.set(k, acc.length);
      acc.push(row);
    }
  }
}

/**
 * Rate a batch with automatic split / sub-batch retries (avoids slow one-by-one loops).
 */
export async function rateIngredientsBatchResilient(
  names: string[],
  opts: {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    jsonMode?: boolean;
    onSkip?: (name: string, err: unknown) => void;
  } = {},
): Promise<IngredientIntelligenceRow[]> {
  const out: IngredientIntelligenceRow[] = [];

  async function fill(chunk: string[], depth = 0): Promise<void> {
    if (!chunk.length) return;
    if (depth > MAX_FILL_DEPTH) {
      for (const name of chunk) {
        opts.onSkip?.(name, new Error("retry depth exceeded"));
      }
      return;
    }

    let rows: IngredientIntelligenceRow[] = [];
    try {
      rows = await rateIngredientsBatch(chunk, opts);
    } catch (e) {
      if (chunk.length === 1) {
        opts.onSkip?.(chunk[0]!, e);
        return;
      }
      const half = Math.ceil(chunk.length / 2);
      await fill(chunk.slice(0, half), depth + 1);
      await fill(chunk.slice(half), depth + 1);
      return;
    }

    mergeRows(out, rows);
    const missing = missingFromChunk(chunk, rows);
    if (!missing.length) return;

    if (chunk.length === 1) {
      opts.onSkip?.(
        chunk[0]!,
        new Error("LM response did not include a matching ingredient row"),
      );
      return;
    }

    if (missing.length === chunk.length) {
      const half = Math.ceil(chunk.length / 2);
      await fill(chunk.slice(0, half), depth + 1);
      await fill(chunk.slice(half), depth + 1);
      return;
    }

    for (let i = 0; i < missing.length; i += RETRY_SUB_BATCH) {
      await fill(missing.slice(i, i + RETRY_SUB_BATCH), depth + 1);
    }
  }

  await fill(names);
  return out;
}

export async function rateIngredientsBatch(
  names: string[],
  opts: {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    jsonMode?: boolean;
  } = {},
): Promise<IngredientIntelligenceRow[]> {
  if (!names.length) return [];

  const baseUrl = opts.baseUrl ?? process.env.LM_STUDIO_BASE_URL ?? DEFAULT_BASE;
  const model = opts.model ?? process.env.LM_STUDIO_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const jsonMode = opts.jsonMode !== false;
  const maxTokens = Math.min(2048, Math.max(400, names.length * 88 + 96));

  const userPayload = names.map((n, i) => `${i + 1}. ${n}`).join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await withLmStudioLock(async () => {
      let content = await callLmForIngredients(
        baseUrl,
        model,
        maxTokens,
        controller.signal,
        userPayload,
        jsonMode,
      );

      let list: Record<string, unknown>[];
      try {
        list = parseIngredientResponse(content);
      } catch (firstErr) {
        content = await callLmForIngredients(
          baseUrl,
          model,
          maxTokens,
          controller.signal,
          userPayload + LM_RETRY_SUFFIX,
          jsonMode,
        );
        try {
          list = parseIngredientResponse(content);
        } catch (secondErr) {
          throwParseError(content, secondErr);
        }
      }

      return rowsFromParsedList(names, list);
    }, { label: `rate:${names.length}` });
  } finally {
    clearTimeout(timer);
  }
}
