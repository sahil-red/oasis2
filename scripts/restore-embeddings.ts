#!/usr/bin/env -S pnpm tsx
/**
 * Restore embedding column from local binary backup via Supabase REST API.
 * Parallel updates — ~5 minutes for 22k rows.
 *
 *   pnpm tsx scripts/restore-embeddings.ts
 *
 * Prerequisites: run in SQL Editor first:
 *   ALTER TABLE product_search_index ADD COLUMN IF NOT EXISTS embedding vector(1024);
 */

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { adminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

const BIN_PATH = "data/cache/embeddings-22841.bin";
const BATCH = 25;
const CONCURRENCY = 5;

function readBinary(path: string): { ids: string[]; embeddings: Float32Array } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "SCT1") throw new Error("Bad magic");

  let off = 4;
  const version = buf.readUInt16LE(off); off += 2;
  const flags = buf.readUInt8(off); off += 1;
  const dim = buf.readUInt16LE(off); off += 2;
  const count = buf.readUInt32LE(off); off += 4;
  const builtAt = buf.readDoubleLE(off); off += 8;
  off += 11; // reserved
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(buf.toString("ascii", off, off + 36).trim());
    off += 36;
  }
  const embeddings = new Float32Array(count * dim);
  for (let i = 0; i < count * dim; i++) {
    embeddings[i] = buf.readFloatLE(off + i * 4);
  }
  return { ids, embeddings };
}

async function main() {
  const { ids, embeddings } = readBinary(BIN_PATH);
  const dim = 1024;
  const st = adminClient();

  // Find which rows already have embeddings
  const existingSet = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const { data } = await st
      .from("product_search_index")
      .select("product_id")
      .not("embedding", "is", null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data?.length) break;
    for (const r of data) existingSet.add(r.product_id);
  }
  console.log(`[restore] ${existingSet.size} rows already have embeddings, skipping`);

  // Build work list
  const work: Array<{ idx: number; id: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    if (!existingSet.has(ids[i]!)) work.push({ idx: i, id: ids[i]! });
  }
  console.log(`[restore] ${work.length} rows to update`);

  if (!work.length) {
    console.log("[restore] nothing to do");
    return;
  }

  const total = work.length;
  let done = 0;
  let failed = 0;

  const processBatch = async (start: number, end: number) => {
    for (let j = start; j < end; j++) {
      const w = work[j]!;
      const emb = embeddings.slice(w.idx * dim, (w.idx + 1) * dim);
      const vecStr = `[${Array.from(emb).join(",")}]`;
      const { error } = await st
        .from("product_search_index")
        .update({ embedding: vecStr })
        .eq("product_id", w.id);

      if (error) {
        failed++;
        if (failed <= 3) console.error(`[restore] row ${w.id.slice(0,8)} failed:`, error.message);
      } else {
        done++;
      }
    }
  };

  const start = Date.now();
  const batches: Array<[number, number]> = [];
  for (let i = 0; i < work.length; i += BATCH) {
    batches.push([i, Math.min(i + BATCH, work.length)]);
  }

  // Process in concurrent waves
  for (let wave = 0; wave < batches.length; wave += CONCURRENCY) {
    const slice = batches.slice(wave, wave + CONCURRENCY);
    await Promise.all(slice.map(([s, e]) => processBatch(s, e)));
    const pct = Math.round((Math.min(wave + CONCURRENCY, batches.length) / batches.length) * 100);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[restore] ${pct}% (${done}/${work.length}) ${elapsed}s`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[restore] DONE: ${done} updated, ${failed} failed in ${elapsed}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
