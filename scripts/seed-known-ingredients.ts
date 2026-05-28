#!/usr/bin/env -S pnpm tsx
/**
 * Upsert the curated KNOWN_INGREDIENTS dictionary directly to ingredient_intelligence.
 * Run whenever the dictionary is updated:
 *   pnpm exec tsx scripts/seed-known-ingredients.ts
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";
import { KNOWN_INGREDIENTS } from "@/lib/scoring/ingredient-known";

async function main() {
  const s = adminClient();
  const rows = Object.values(KNOWN_INGREDIENTS).map((row) => ({
    normalized_name: row.normalized_name,
    display_name: row.display_name,
    nova_class: row.nova_class,
    role: row.role,
    concern_tier: row.concern_tier,
    concern_reasons: row.concern_reasons,
    intrinsic_quality: row.intrinsic_quality,
    synonyms: row.synonyms ?? [],
    model: "curated_v1",
    rated_at: new Date().toISOString(),
  }));

  const CHUNK = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await s.from("ingredient_intelligence").upsert(chunk, { onConflict: "normalized_name" });
    if (error) throw error;
    upserted += chunk.length;
    console.log(`[seed-known] upserted ${upserted}/${rows.length}`);
  }

  console.log(`\nDone — ${upserted} known ingredients seeded to ingredient_intelligence`);
}

main().catch(e => { console.error(e); process.exit(1); });
