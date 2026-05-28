#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";
async function main() {
  const s = adminClient();
  const names = ["salt", "fructooligosaccharides", "fos", "maltitol", "polydextrose", "erythritol", "stevia", "permitted emulsifier and stabilizer", "vegetable protein"];
  const { data, error } = await s.from("ingredient_intelligence").select("normalized_name,nova_class,concern_tier,role,concern_reasons").in("normalized_name", names);
  if (error) throw error;
  for (const r of data ?? []) console.log(JSON.stringify(r));
  console.log(`found ${data?.length ?? 0} rows`);
}
main().catch(e => { console.error(e); process.exit(1); });
