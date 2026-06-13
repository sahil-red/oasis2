#!/usr/bin/env -S pnpm tsx
/**
 * Sync product_search_index.scout_score from core_scores after a rescore.
 * One UPDATE...FROM join (touches only changed rows) — far lighter than a full
 * search-index rebuild. Run after `pnpm score -- --force`.
 *
 *   pnpm score:sync
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL not set");
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    const res = await sql`
      UPDATE product_search_index psi
      SET scout_score = cs.score
      FROM core_scores cs
      WHERE psi.product_id = cs.product_id
        AND psi.scout_score IS DISTINCT FROM cs.score
    `;
    console.log(`scout_score synced: ${res.count} rows changed`);

    const dist = await sql`
      SELECT
        count(*) FILTER (WHERE scout_score >= 80) AS s80,
        count(*) FILTER (WHERE scout_score >= 65 AND scout_score < 80) AS s65,
        count(*) FILTER (WHERE scout_score >= 40 AND scout_score < 65) AS s40,
        count(*) FILTER (WHERE scout_score < 40) AS slow,
        count(*) FILTER (WHERE scout_score IS NULL) AS snull
      FROM product_search_index`;
    console.log("scout_score buckets:", JSON.stringify(dist[0]));
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
