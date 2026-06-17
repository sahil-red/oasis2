#!/usr/bin/env -S pnpm tsx
/**
 * Sync the display signals for the new scoring paradigm (Part B) onto
 * product_search_index, after `pnpm score -- --force && pnpm score:sync`:
 *   - absolute_score  — the CONSISTENT health score (from core_scores), the tier source
 *   - category_rank / category_size / category_label — the product's rank within its
 *     real peer group on the CLEAN Zepto taxonomy (l3 when the cohort is big enough,
 *     else subcategory, else category), ranked by absolute_score.
 *
 * This replaces the old v9 relative percentile, which ranked soya chunks against
 * lentils ("Dals & Pulses") in noisy cohorts. Now they rank within "Soya Chunks".
 *
 *   pnpm score:rank
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const MIN_COHORT = 6; // finest grain (l3) must have at least this many to rank within it

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL not set");
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 });
  try {
    await sql`ALTER TABLE product_search_index ADD COLUMN IF NOT EXISTS absolute_score smallint`;
    await sql`ALTER TABLE product_search_index ADD COLUMN IF NOT EXISTS category_rank smallint`;
    await sql`ALTER TABLE product_search_index ADD COLUMN IF NOT EXISTS category_size smallint`;
    await sql`ALTER TABLE product_search_index ADD COLUMN IF NOT EXISTS category_label text`;

    const abs = await sql`
      UPDATE product_search_index psi SET absolute_score = cs.absolute_score
      FROM core_scores cs
      WHERE cs.product_id = psi.product_id AND psi.absolute_score IS DISTINCT FROM cs.absolute_score`;
    console.log(`[score:rank] absolute_score synced: ${abs.count} rows`);

    // Pick the finest cohort grain with enough peers, then rank within it by health.
    const ranked = await sql`
      WITH sized AS (
        SELECT product_id, absolute_score, category,
          CASE
            WHEN NULLIF(l3_category,'') IS NOT NULL AND count(*) OVER (PARTITION BY l3_category) >= ${MIN_COHORT} THEN 'l3:'||l3_category
            WHEN NULLIF(subcategory,'') IS NOT NULL AND count(*) OVER (PARTITION BY subcategory) >= ${MIN_COHORT} THEN 'sub:'||subcategory
            ELSE 'cat:'||COALESCE(category,'all')
          END AS cohort_key,
          CASE
            WHEN NULLIF(l3_category,'') IS NOT NULL AND count(*) OVER (PARTITION BY l3_category) >= ${MIN_COHORT} THEN l3_category
            WHEN NULLIF(subcategory,'') IS NOT NULL AND count(*) OVER (PARTITION BY subcategory) >= ${MIN_COHORT} THEN subcategory
            ELSE category
          END AS cohort_label
        FROM product_search_index
        WHERE absolute_score IS NOT NULL
      ),
      r AS (
        SELECT product_id, cohort_label,
          rank() OVER (PARTITION BY cohort_key ORDER BY absolute_score DESC) rnk,
          count(*) OVER (PARTITION BY cohort_key) sz
        FROM sized
      )
      UPDATE product_search_index psi
      SET category_rank = r.rnk, category_size = r.sz, category_label = r.cohort_label
      FROM r WHERE r.product_id = psi.product_id`;
    console.log(`[score:rank] category rank computed: ${ranked.count} rows`);

    // Propagate to core_scores too — catalog browse + the PDP read core_scores
    // (search reads product_search_index directly). Same rank, two read paths.
    await sql`ALTER TABLE core_scores ADD COLUMN IF NOT EXISTS category_rank smallint`;
    await sql`ALTER TABLE core_scores ADD COLUMN IF NOT EXISTS category_size smallint`;
    await sql`ALTER TABLE core_scores ADD COLUMN IF NOT EXISTS category_label text`;
    const prop = await sql`
      UPDATE core_scores cs
      SET category_rank = psi.category_rank, category_size = psi.category_size, category_label = psi.category_label
      FROM product_search_index psi
      WHERE psi.product_id = cs.product_id AND psi.category_rank IS NOT NULL`;
    console.log(`[score:rank] propagated to core_scores: ${prop.count} rows`);

    const sample = await sql`
      SELECT name, absolute_score abs, category_rank rnk, category_size sz, category_label lbl
      FROM product_search_index
      WHERE name ILIKE '%soya chunk%' AND category_rank IS NOT NULL
      ORDER BY category_rank LIMIT 6`;
    console.log("\nsoya-chunk cohort sample:");
    for (const s of sample as any[]) console.log(`  #${s.rnk}/${s.sz} in "${s.lbl}"  abs=${s.abs}  ${s.name.slice(0, 38)}`);
  } finally {
    await sql.end({ timeout: 8 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
