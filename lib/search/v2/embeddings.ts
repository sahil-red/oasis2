/**
 * L2 embedding layer — SEARCH_V2_PLAN.md §1, §7a, §16.2
 * OpenAI-compatible /embeddings endpoint (Voyage, OpenAI, local).
 */
import { Agent, fetch as undiciFetch } from "undici";
import { EMBEDDING_DIM } from "@/lib/search/v2/types";

const dispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 60_000,
  headersTimeout: 30_000,
});

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

function resolveEmbeddingEndpoint(): { apiKey: string; baseUrl: string; model: string } | null {
  if (process.env.EMBEDDING_API_KEY?.trim()) {
    return {
      apiKey: process.env.EMBEDDING_API_KEY.trim(),
      baseUrl: (
        process.env.EMBEDDING_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        "https://api.openai.com/v1"
      ).replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    };
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      apiKey: process.env.OPENAI_API_KEY.trim(),
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    };
  }
  const lmBase = process.env.EMBEDDING_BASE_URL?.trim() || process.env.LM_STUDIO_BASE_URL?.trim();
  if (lmBase && (process.env.EMBEDDING_BASE_URL || process.env.EMBEDDING_USE_LM_STUDIO === "true")) {
    return {
      apiKey: process.env.EMBEDDING_API_KEY?.trim() || process.env.LM_STUDIO_API_KEY?.trim() || "lm-studio",
      baseUrl: lmBase.replace(/\/+$/, ""),
      model: process.env.EMBEDDING_MODEL ?? process.env.LM_STUDIO_MODEL ?? "text-embedding-nomic-embed-text-v1.5",
    };
  }
  return null;
}

let embedWarned = false;

export function isEmbeddingConfigured(): boolean {
  return resolveEmbeddingEndpoint() !== null;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const endpoint = resolveEmbeddingEndpoint();
  if (!endpoint) return texts.map(() => []);

  const { apiKey, baseUrl, model } = endpoint;
  const dimensions = Number(process.env.EMBEDDING_DIM ?? EMBEDDING_DIM);

  try {
    const res = await undiciFetch(`${baseUrl}/embeddings`, {
      method: "POST",
      dispatcher,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions,
      }),
    });

    const body = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? `Embeddings HTTP ${res.status}`);

    const sorted = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
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

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec ?? [];
}

export async function embedTextBatch(texts: string[], batchSize = 64): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const vecs = await embedTexts(chunk);
    out.push(...vecs);
  }
  return out;
}
