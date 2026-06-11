#!/usr/bin/env -S pnpm tsx
/**
 * Export embeddings from product_search_index to a local binary file.
 * Run BEFORE dropping the embedding columns from the DB.
 *
 *   pnpm tsx scripts/export-embeddings.ts
 */

import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";

config({ path: ".env.local" });

const DIM = 1024;
const HEADER_SIZE = 32;

function buildBinary(ids: string[], embeddings: Float32Array): Buffer {
  const n = ids.length;
  const idBytes = Buffer.alloc(n * 36);
  for (let i = 0; i < n; i++) {
    idBytes.write(ids[i]!.padEnd(36, " "), i * 36, 36, "ascii");
  }

  const embBuf = Buffer.from(embeddings.buffer);
  const totalSize = HEADER_SIZE + idBytes.length + embBuf.length;

  const buf = Buffer.alloc(totalSize);
  let off = 0;

  // Magic "SCT1" + version=1
  buf.write("SCT1", off, 4, "ascii"); off += 4;
  buf.writeUInt16LE(1, off); off += 2;          // version
  buf.writeUInt8(0, off); off += 1;              // flags
  buf.writeUInt16LE(DIM, off); off += 2;         // dim
  buf.writeUInt32LE(n, off); off += 4;           // count
  buf.writeDoubleLE(Date.now(), off); off += 8;  // built_at
  off += 11;                                     // reserved

  idBytes.copy(buf, off); off += idBytes.length;
  embBuf.copy(buf, off);

  return buf;
}

async function main() {
  const st = adminClient();
  const ids: string[] = [];
  const embList: number[][] = [];

  console.log("[export-embeddings] loading embeddings from DB...");

  for (let page = 0; page < 50; page++) {
    const { data, error } = await st
      .from("product_search_index")
      .select("product_id, embedding")
      .not("embedding", "is", null)
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;

    for (const row of data) {
      const emb = typeof row.embedding === "string"
        ? JSON.parse(row.embedding)
        : row.embedding;
      if (!emb || emb.length !== DIM) continue;
      ids.push(row.product_id as string);
      embList.push(emb as number[]);
    }
    console.log(`  page ${page}: ${ids.length} rows`);
  }

  if (!ids.length) {
    console.log("[export-embeddings] no embeddings found");
    return;
  }

  // Flatten into Float32Array
  const flat = new Float32Array(ids.length * DIM);
  for (let i = 0; i < embList.length; i++) {
    flat.set(embList[i]!, i * DIM);
  }

  const binary = buildBinary(ids, flat);
  const path = `data/cache/embeddings-${ids.length}.bin`;
  await writeFile(path, binary);

  console.log(`[export-embeddings] saved ${ids.length} × ${DIM} embeddings (${(binary.length / 1024 / 1024).toFixed(1)} MB) to ${path}`);
  console.log("[export-embeddings] safe to drop embedding columns now");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
