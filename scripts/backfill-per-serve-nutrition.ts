#!/usr/bin/env -S pnpm tsx
/**
 * Phase 1: attach per-serving nutrition into products.nutrition.extra
 *
 *   pnpm backfill:per-serve
 *   pnpm backfill:per-serve -- --limit=500
 *   pnpm backfill:per-serve -- --dry-run
 */

import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { attachPerServeNutrition } from "@/lib/scoring/serving";
import { inferRoleCohort } from "@/lib/scoring/role-cohort";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]) || null;
  }
  return { limit, dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const pageSize = 200;
  let offset = 0;
  let updated = 0;
  let scanned = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select("id, name, category, subcategory, net_weight, nutrition, attributes")
      .not("nutrition", "is", null)
      .range(offset, offset + pageSize - 1);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (args.limit != null && scanned >= args.limit) break;
      scanned++;

      const nutrition = row.nutrition as ProductNutrition | null;
      const { nutrition: next } = attachPerServeNutrition(nutrition, {
        attributes: (row.attributes as Record<string, string> | null) ?? null,
        net_weight: row.net_weight as string | null,
        name: row.name as string,
        category: row.category as string | null,
        subcategory: row.subcategory as string | null,
      });

      if (!next || JSON.stringify(next) === JSON.stringify(nutrition)) continue;

      const role = inferRoleCohort({
        name: row.name as string,
        category: row.category as string | null,
        subcategory: row.subcategory as string | null,
      });
      const serveG = next.extra?.serving_size_g;

      if (!args.dryRun) {
        const { error: upErr } = await supabase
          .from("products")
          .update({ nutrition: next })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }
      updated++;

      if (updated <= 5 || updated % 200 === 0) {
        console.log(
          `[per-serve] ${row.name?.slice(0, 40)} role=${role} serve=${serveG}g source=${next.extra?.serving_resolution}`,
        );
      }
    }

    if (args.limit != null && scanned >= args.limit) break;
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`[per-serve] done scanned=${scanned} updated=${updated} dry_run=${args.dryRun}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
