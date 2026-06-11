#!/usr/bin/env -S pnpm tsx
/**
 * Live-fire search probes — end-to-end assertions against the REAL pipeline
 * (prod DB + LLM + embeddings; costs a few rupees per run).
 *
 *   pnpm search:probes
 *
 * Each probe encodes a bug class the VET/RCA fixed. A failure here means a
 * regression in serving quality, not a unit-level nit:
 *   - ANN starvation (rare types must be retrievable)
 *   - relative-tier mislabeling (grams must win "high protein")
 *   - safety pinning (allergen exclusions must never be relaxed or leaked)
 *   - honest relaxation (no silent garbage when an ask can't be met)
 *   - physics validity (impossible macros must not top sorts)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

type Probe = {
  query: string;
  assert: (r: import("@/lib/search/v2/types").SearchV2Result) => string | null; // null = pass
};

const PROBES: Probe[] = [
  {
    query: "tofu high protein",
    assert: (r) => {
      const tofus = r.items.filter((i) => i.row.primary_type === "tofu").length;
      if (tofus < 3) return `expected ≥3 tofu items, got ${tofus}`;
      const top = r.items[0]?.row;
      if (top?.protein_g == null || top.protein_g < 15) {
        return `top item protein ${top?.protein_g}g — grams sort broken?`;
      }
      return null;
    },
  },
  {
    query: "high protein snacks",
    assert: (r) => {
      if (r.candidates_total < 30) return `pool ${r.candidates_total} — recall starvation?`;
      const bad = r.items.slice(0, 3).filter((i) => (i.row.protein_g ?? 0) < 10);
      if (bad.length) return `top-3 includes <10g protein items`;
      const impossible = r.items.filter((i) => (i.row.protein_g ?? 0) > 100);
      if (impossible.length) return `physics guard failed: >100g/100g item served`;
      return null;
    },
  },
  {
    query: "peanut free snacks",
    assert: (r) => {
      if (r.relaxation_steps.some((s) => /allergen/i.test(s))) {
        return `SAFETY: allergen exclusion was relaxed`;
      }
      const leaked = r.items.filter((i) => /peanut|groundnut|mungfali/i.test(i.row.name));
      if (leaked.length) return `SAFETY: ${leaked.length} peanut product(s) served`;
      if (r.items.length < 3) return `only ${r.items.length} items`;
      return null;
    },
  },
  {
    query: "kiwi yogurt",
    assert: (r) => {
      const kiwiInResults = r.items.some((i) => /kiwi/i.test(i.row.name));
      const honest = r.relaxation_steps.some((s) => /kiwi/i.test(s));
      if (!kiwiInResults && !honest) {
        return `non-kiwi results served without an honest relaxation message`;
      }
      return null;
    },
  },
  {
    query: "biscuits",
    assert: (r) => {
      if (r.items.length < 6) return `only ${r.items.length} items`;
      const family = r.items.filter((i) =>
        /biscuit|cookie|rusk|cracker|wafer/i.test(i.row.primary_type ?? ""),
      ).length;
      if (family < Math.ceil(r.items.length * 0.7)) {
        return `only ${family}/${r.items.length} in the biscuit family — type filter broken?`;
      }
      return null;
    },
  },
  {
    query: "low sugar chocolate",
    assert: (r) => {
      const top3 = r.items.slice(0, 3);
      const sugary = top3.filter((i) => (i.row.sugar_g ?? 0) > 15);
      if (sugary.length) return `top-3 includes >15g sugar — soft ranking broken?`;
      return null;
    },
  },
];

async function main() {
  const { runSearchV2 } = await import("@/lib/search/v2/pipeline");
  let failed = 0;
  for (const p of PROBES) {
    const t0 = Date.now();
    try {
      const r = await runSearchV2(p.query, { limit: 12 });
      const err = p.assert(r);
      if (err) {
        failed++;
        console.error(`[probe] FAIL "${p.query}" (${Date.now() - t0}ms): ${err}`);
      } else {
        console.log(`[probe] ok   "${p.query}" (${Date.now() - t0}ms, ${r.items.length} items)`);
      }
    } catch (e) {
      failed++;
      console.error(`[probe] FAIL "${p.query}" threw: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  if (failed) {
    console.error(`[search:probes] ${failed}/${PROBES.length} probes failed`);
    process.exit(1);
  }
  console.log(`[search:probes] all ${PROBES.length} probes passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
