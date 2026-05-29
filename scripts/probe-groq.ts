#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.env.LM_STUDIO_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    console.log("status: no_api_key");
    process.exit(1);
  }
  const models = ["llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct"];
  for (const model of models) {
    const t0 = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });
    const ms = Date.now() - t0;
    const body = await res.text();
    let summary = body.slice(0, 280);
    if (res.status === 429) {
      try {
        const j = JSON.parse(body) as { error?: { message?: string } };
        summary = j.error?.message?.slice(0, 280) ?? summary;
      } catch {
        /* keep raw */
      }
    }
    console.log(JSON.stringify({ model, status: res.status, ms, summary }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
