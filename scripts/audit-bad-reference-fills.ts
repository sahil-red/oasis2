#!/usr/bin/env -S pnpm tsx
/**
 * Audit products where nutrition was filled by reference-seed (IFCT/USDA) but
 * the category strongly implies a processed/branded packaged product where
 * raw-ingredient nutrition is wrong.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";

// Categories that NEVER warrant reference-seed nutrition fill (processed/branded)
const PROCESSED_CATEGORIES = [
  "Cold Drinks & Juices",
  "Tea, Coffee & More",
  "Tea Coffee & More",
  "Munchies",
  "Sweet Tooth",
  "Bakery & Biscuits",
  "Breakfast & Sauces",
  "Frozen Food",
  "Instant & Frozen Food",
  "Ice Creams & More",
  "Dairy, Bread & Eggs",
  "Atta, Rice, Oil & Dals",
  "Beauty & Wellness",
  "Cleaning Essentials",
  "Pharmacy",
];

// Names that imply a processed/branded product (override category)
const PROCESSED_NAME_HINTS = /\b(milkshake|smoothie|drink|protein|powder|mix|shake|biscuit|cookie|cake|cookie|chocolate|ice\s*cream|noodle|chip|snack|bar|wafer|cracker|cereal|muesli|granola|yogurt|curd\s+drink|lassi|peanut\s+butter|jam|spread|sauce|ketchup|pickle|masala\s+mix|instant)\b/i;

async function main() {
  const s = adminClient();
  const all: Array<{ id: string; name: string; category: string | null; nutrition: any; ingredients_raw: string | null }> = [];

  let off = 0;
  while (true) {
    const { data, error } = await s
      .from("products")
      .select("id, name, category, subcategory, nutrition, ingredients_raw")
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .range(off, off + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const ext = (r.nutrition as any)?.extra;
      if (ext?.reference_id) all.push(r as any);
    }
    if (data.length < 1000) break;
    off += 1000;
  }

  console.log(`Total products with reference-seeded nutrition: ${all.length}\n`);

  const bad: typeof all = [];
  const good: typeof all = [];
  for (const p of all) {
    const cat = p.category ?? "";
    const name = p.name ?? "";
    const isProcessedCat = PROCESSED_CATEGORIES.some(c => cat.includes(c));
    const isProcessedName = PROCESSED_NAME_HINTS.test(name);
    if (isProcessedCat || isProcessedName) bad.push(p);
    else good.push(p);
  }

  console.log(`Bad reference fills (likely wrong): ${bad.length}`);
  console.log(`Plausible reference fills (raw foods): ${good.length}\n`);

  console.log("== Sample bad fills ==");
  for (const p of bad.slice(0, 25)) {
    const ext = (p.nutrition as any).extra;
    console.log(`  ${p.name?.slice(0, 50)} → ${ext.reference_id} (cat=${p.category})`);
  }

  // Group bad fills by category
  const byCat = new Map<string, number>();
  for (const p of bad) byCat.set(p.category ?? "—", (byCat.get(p.category ?? "—") ?? 0) + 1);
  console.log("\n== Bad fills by category ==");
  for (const [cat, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${n.toString().padStart(5)} ${cat}`);
  }

  console.log(`\nBad IDs to clean: ${bad.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
