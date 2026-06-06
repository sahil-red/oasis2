#!/usr/bin/env -S pnpm tsx
/**
 * Pre-ship checklist for Search V2 production.
 *
 *   pnpm search:ship-check
 */
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

async function main() {
  const required = [
    "SEARCH_V2_ENABLED",
    "EMBEDDING_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_SEARCH_API_KEY",
  ];
  const optional = ["OPENAI_API_KEY"];

  let ok = true;
  console.log("[search:ship-check] environment");
  for (const key of required) {
    const val = process.env[key] || (key === "EMBEDDING_API_KEY" ? process.env.OPENAI_API_KEY : "");
    if (!val) {
      console.error(`  ✗ ${key} missing`);
      ok = false;
    } else {
      console.log(`  ✓ ${key}`);
    }
  }
  for (const key of optional) {
    if (process.env[key]) console.log(`  · ${key} (optional)`);
  }

  console.log("\n[search:ship-check] database");
  try {
    const supabase = adminClient();
    const { count, error } = await supabase
      .from("product_search_index")
      .select("product_id", { count: "exact", head: true });

    if (error) {
      console.error(`  ✗ product_search_index: ${error.message}`);
      ok = false;
    } else if ((count ?? 0) < 1000) {
      console.error(`  ✗ product_search_index has only ${count} rows — run pnpm search:build-index`);
      ok = false;
    } else {
      console.log(`  ✓ product_search_index ${count} rows`);
    }

    const { data: sample } = await supabase
      .from("product_search_index")
      .select("primary_type, embedding")
      .not("primary_type", "is", null)
      .limit(5);
    const withEmbed = (sample ?? []).filter((r) => r.embedding != null).length;
    if (withEmbed === 0) {
      console.error("  ✗ no embeddings on sample rows — rebuild index with EMBEDDING_API_KEY");
      ok = false;
    } else {
      console.log(`  ✓ embeddings present on sample`);
    }
  } catch (e) {
    console.error(`  ✗ db: ${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  if (!ok) {
    console.error("\n[search:ship-check] NOT READY");
    process.exit(1);
  }
  console.log("\n[search:ship-check] READY for SEARCH_V2_ENABLED=true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
