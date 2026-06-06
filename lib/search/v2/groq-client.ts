/** Groq fast-model chat for Search V2 intent (§9). */
import { Agent, fetch as undiciFetch } from "undici";
import { extractJsonObject } from "@/lib/search/deepseek-client";

const dispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 45_000,
  headersTimeout: 30_000,
});

export type GroqChatResult = {
  content: string;
  model: string;
};

export async function groqChat(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<GroqChatResult> {
  const apiKey = process.env.GROQ_API_KEY ?? process.env.LM_STUDIO_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const baseUrl = (
    process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"
  ).replace(/\/+$/, "");
  const model =
    opts.model ?? process.env.GROQ_INTENT_MODEL ?? "llama-3.1-8b-instant";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await undiciFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      dispatcher,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? `Groq HTTP ${res.status}`);
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("Groq returned empty content");
    return { content, model };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseGroqJson<T>(content: string): T {
  return extractJsonObject(content) as T;
}
