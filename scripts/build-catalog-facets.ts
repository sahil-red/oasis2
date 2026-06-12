#!/usr/bin/env -S pnpm tsx
/**
 * Write catalog facets (brands, primary_types) to a static JSON file.
 * Called during build; imported at runtime for 0ms facet loading.
 *
 *   pnpm build:facets
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname ?? ".", "..");
const OUTPUT = join(REPO_ROOT, "data", "catalog-facets.json");

async function main() {
  const supabase = adminClient();
  const { data } = await supabase.rpc("search_v2_facets");
  const obj = (data ?? {}) as { brands?: string[]; primary_types?: string[] };

  const facets = {
    brands: (obj.brands ?? []).map((b) => b.toLowerCase()),
    primary_types: (obj.primary_types ?? []).map((t) => t.toLowerCase()),
    built_at: new Date().toISOString(),
  };

  writeFileSync(OUTPUT, JSON.stringify(facets));
  console.log(`[build:facets] wrote ${facets.brands.length} brands, ${facets.primary_types.length} types → ${OUTPUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
