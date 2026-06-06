/**
 * L2 embedding layer — SEARCH_V2_PLAN.md §1, §7a, §16.2
 * Voyage AI (default) or OpenAI-compatible /embeddings endpoint.
 */
import { Agent, fetch as undiciFetch } from "undici";
import { EMBEDDING_DIM } from "@/lib/search/v2/types";

const dispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 60_000,
  headersTimeout: 30_000,
});

export type EmbeddingInputType = "query" | "document";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

type EmbeddingEndpoint = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "voyage" | "openai" | "generic";
};

function resolveEmbeddingEndpoint(): EmbeddingEndpoint | null {
  const voyageKey =
    process.env.VOYAGE_API_KEY?.trim() ||
    (process.env.EMBEDDING_PROVIDER?.toLowerCase() === "voyage"
      ? process.env.EMBEDDING_API_KEY?.trim()
      : undefined);
  if (voyageKey) {
    return {
      apiKey: voyageKey,
      baseUrl: (process.env.EMBEDDING_BASE_URL ?? "https://api.voyageai.com/v1").replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? "voyage-multilingual-2",
      provider: "voyage",
    };
  }

  if (process.env.EMBEDDING_API_KEY?.trim()) {
    const baseUrl = (
      process.env.EMBEDDING_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    const isVoyage = baseUrl.includes("voyageai.com");
    return {
      apiKey: process.env.EMBEDDING_API_KEY.trim(),
      baseUrl,
      model: process.env.EMBEDDING_MODEL ?? (isVoyage ? "voyage-multilingual-2" : "text-embedding-3-small"),
      provider: isVoyage ? "voyage" : "openai",
    };
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      apiKey: process.env.OPENAI_API_KEY.trim(),
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      provider: "openai",
    };
  }

  const lmBase = process.env.EMBEDDING_BASE_URL?.trim() || process.env.LM_STUDIO_BASE_URL?.trim();
  if (lmBase && (process.env.EMBEDDING_BASE_URL || process.env.EMBEDDING_USE_LM_STUDIO === "true")) {
    return {
      apiKey: process.env.EMBEDDING_API_KEY?.trim() || process.env.LM_STUDIO_API_KEY?.trim() || "lm-studio",
      baseUrl: lmBase.replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? process.env.LM_STUDIO_MODEL ?? "text-embedding-nomic-embed-text-v1.5",
      provider: "generic",
    };
  }
  return null;
}

let embedWarned = false;

export function isEmbeddingConfigured(): boolean {
  return resolveEmbeddingEndpoint() !== null;
}

export async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType = "document",
): Promise<number[][]> {
  if (!texts.length) return [];
  const endpoint = resolveEmbeddingEndpoint();
  if (!endpoint) return texts.map(() => []);

  const { apiKey, baseUrl, model, provider } = endpoint;
  const dimensions = Number(process.env.EMBEDDING_DIM ?? EMBEDDING_DIM);

  const body: Record<string, unknown> = {
    model,
    input: texts,
  };
  if (provider === "voyage") {
    body.input_type = inputType;
  } else if (provider === "openai") {
    body.dimensions = dimensions;
  }

  try {
    const res = await undiciFetch(`${baseUrl}/embeddings`, {
      method: "POST",
      dispatcher,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(payload.error?.message ?? `Embeddings HTTP ${res.status}`);

    const sorted = [...(payload.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((row) => row.embedding ?? []);
  } catch (err) {
    if (!embedWarned) {
      embedWarned = true;
      console.warn(
        `[embeddings] unavailable (${err instanceof Error ? err.message : err}) — index will use lexical fallback`,
      );
    }
    return texts.map(() => []);
  }
}

export async function embedText(text: string, inputType: EmbeddingInputType = "document"): Promise<number[]> {
  const [vec] = await embedTexts([text], inputType);
  return vec ?? [];
}

export async function embedTextBatch(
  texts: string[],
  batchSize = 64,
  inputType: EmbeddingInputType = "document",
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const vecs = await embedTexts(chunk, inputType);
    out.push(...vecs);
  }
  return out;
}
