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
  let ok = true;
  console.log("[search:ship-check] environment");

  const embeddingSource = process.env.VOYAGE_API_KEY?.trim()
    ? "VOYAGE_API_KEY"
    : process.env.EMBEDDING_API_KEY?.trim()
      ? "EMBEDDING_API_KEY"
      : process.env.OPENAI_API_KEY?.trim()
        ? "OPENAI_API_KEY"
        : process.env.EMBEDDING_BASE_URL?.trim()
          ? "EMBEDDING_BASE_URL"
          : null;
  if (!embeddingSource) {
    console.log("  · embeddings: no cloud key (lexical fallback only; optional EMBEDDING_API_KEY for full quality)");
  } else {
    console.log(`  ✓ embeddings (${embeddingSource})`);
  }

  if (!process.env.GROQ_API_KEY?.trim()) {
    console.log("  · GROQ_API_KEY missing (intent uses degraded lexical path)");
  } else {
    console.log("  ✓ GROQ_API_KEY");
  }

  const deepseekKey =
    process.env.DEEPSEEK_SEARCH_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  if (!deepseekKey) {
    console.log("  · deepseek key missing (offline enrichment skipped until configured)");
  } else {
    console.log(`  ✓ deepseek (${process.env.DEEPSEEK_SEARCH_API_KEY ? "DEEPSEEK_SEARCH_API_KEY" : "DEEPSEEK_API_KEY"})`);
  }

  const v2Enabled =
    process.env.SEARCH_V2_ENABLED === "1" || process.env.SEARCH_V2_ENABLED === "true";
  if (!v2Enabled) {
    console.log("  · SEARCH_V2_ENABLED=false (set true when ready to flip live)");
  } else {
    console.log("  ✓ SEARCH_V2_ENABLED");
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
      console.log("  · no embeddings in index yet (optional — add EMBEDDING_API_KEY + rebuild for semantic quality)");
    } else {
      console.log(`  ✓ embeddings present on sample`);
    }

    const { error: savedErr } = await supabase.from("saved_searches").select("id", { head: true, count: "exact" });
    if (savedErr?.message?.includes("does not exist")) {
      console.error("  ✗ saved_searches table missing — run pnpm db:migrate");
      ok = false;
    } else if (savedErr) {
      console.error(`  ✗ saved_searches: ${savedErr.message}`);
      ok = false;
    } else {
      console.log("  ✓ saved_searches table");
    }
  } catch (e) {
    console.error(`  ✗ db: ${e instanceof Error ? e.message : e}`);
    ok = false;
  }

  if (!ok) {
    console.error("\n[search:ship-check] NOT READY");
    process.exit(1);
  }
  if (!process.env.CRON_SECRET) {
    console.log("\n[search:ship-check] note: set CRON_SECRET for /api/cron/search-alerts (daily sweep)");
  } else {
    console.log("\n[search:ship-check] cron: GET /api/cron/search-alerts with Authorization: Bearer $CRON_SECRET");
  }
  console.log("\n[search:ship-check] READY for SEARCH_V2_ENABLED=true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
