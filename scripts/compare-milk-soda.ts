import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { resolveBaseline } from "@/lib/scoring/baselines";

config({ path: ".env.local" });

async function main() {
  const s = adminClient();
  const { data } = await s
    .from("core_scores")
    .select(
      "score, subscores, products!inner(name, category, subcategory, nutrition, ingredients_raw)",
    )
    .limit(300);

  type Row = {
    score: number;
    sub: { nutrition: number; additives: number; labels: number };
    name: string;
    cat: string | null;
    subcat: string | null;
    n: Record<string, number | undefined>;
  };

  const rows: Row[] = (data ?? []).map((r) => {
    const p = r.products as {
      name: string;
      category: string | null;
      subcategory: string | null;
      nutrition: Record<string, number> | null;
    };
    return {
      score: r.score,
      sub: r.subscores as Row["sub"],
      name: p.name,
      cat: p.category,
      subcat: p.subcategory,
      n: (p.nutrition ?? {}) as Record<string, number | undefined>,
    };
  });

  const milk = rows.filter((r) => /milk|doodh|lassi|curd|yogurt|dahi/i.test(r.name));
  const soda = rows.filter((r) =>
    /cola|pepsi|coke|sprite|fanta|soda|mountain dew|thums up|soft drink/i.test(r.name),
  );

  const line = (r: Row) => {
    const bl = resolveBaseline(r.cat, r.subcat);
    return [
      r.score,
      `N${r.sub.nutrition} A${r.sub.additives}`,
      `[${r.cat ?? "?"}]`,
      r.name.slice(0, 40),
      `sug=${r.n.sugar_g_100g ?? "-"} sat=${r.n.saturated_fat_g_100g ?? "-"} pro=${r.n.protein_g_100g ?? "-"} kcal=${r.n.energy_kcal_100g ?? "-"}`,
      `baseline floor=${bl.floor}`,
    ].join(" | ");
  };

  console.log("=== MILK / DAIRY (lowest scores) ===\n");
  milk.sort((a, b) => a.score - b.score).slice(0, 15).forEach((r) => console.log(line(r)));

  console.log("\n=== SODA (highest scores) ===\n");
  soda.sort((a, b) => b.score - a.score).slice(0, 10).forEach((r) => console.log(line(r)));
}

main();
