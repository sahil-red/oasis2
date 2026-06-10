#!/usr/bin/env -S pnpm tsx
/**
 * Re-embed product_search_index rows that have a NULL embedding (e.g. rows enriched
 * before Voyage was configured). Embeddings only — no DeepSeek, so this is free.
 *   pnpm tsx scripts/backfill-embeddings.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { embedTextBatch } from "@/lib/search/v2/embeddings";

async function main() {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1 });
  try {
    const rows = await sql<
      { product_id: string; search_doc: string | null; primary_type: string | null; name: string }[]
    >`select product_id, search_doc, primary_type, name
      from product_search_index where embedding is null`;
    console.log(`[backfill-embeddings] ${rows.length} rows with null embedding`);
    if (!rows.length) return;

    const BATCH = 64;
    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const [docEmbeds, typeEmbeds] = await Promise.all([
        embedTextBatch(chunk.map((r) => r.search_doc ?? r.name), 64, "document"),
        embedTextBatch(chunk.map((r) => r.primary_type ?? r.search_doc ?? r.name), 64, "document"),
      ]);
      for (let j = 0; j < chunk.length; j++) {
        const e = docEmbeds[j];
        const te = typeEmbeds[j];
        if (!e?.length) continue;
        await sql`update product_search_index set
            embedding = ${`[${e.join(",")}]`}::vector,
            type_embedding = ${te?.length ? `[${te.join(",")}]` : null}::vector
          where product_id = ${chunk[j]!.product_id}`;
        done++;
      }
      console.log(`[backfill-embeddings] ${Math.min(i + BATCH, rows.length)}/${rows.length} (${done} updated)`);
    }
    console.log(`[backfill-embeddings] done — ${done} embedded`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
