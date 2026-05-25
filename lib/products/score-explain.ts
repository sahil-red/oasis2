import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ConcernEntry, ScoreBand, SubScores } from "@/lib/supabase/types";
import { labelForBand } from "@/lib/utils";

export type ScoreExplanation = {
  reasons: string[];
  tradeoffs: string[];
};

function sugar(n: ProductNutrition | null): number | null {
  const s = n?.sugar_g_100g ?? n?.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

function pushUnique(list: string[], line: string) {
  if (!list.includes(line)) list.push(line);
}

export function explainScore(opts: {
  score: number;
  band: ScoreBand;
  subscores?: SubScores | null;
  concerns?: ConcernEntry[] | Array<{ type?: string; message?: string; ingredient?: string; tier?: string }>;
  breakdown?: { notes?: string[]; hard_capped?: boolean } | null;
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  productName?: string | null;
}): ScoreExplanation {
  const reasons: string[] = [];
  const n = opts.nutrition;
  const sugarG = sugar(n);
  const protein = n?.protein_g_100g;
  const fiber = n?.fiber_g_100g;
  const sodium = n?.sodium_mg_100g;
  const kcal = n?.energy_kcal_100g;
  const subs = opts.subscores;

  if (sugarG != null) {
    if (sugarG >= 18) pushUnique(reasons, `High sugar for a packaged food (${sugarG}g per 100g)`);
    else if (sugarG >= 10) pushUnique(reasons, `Moderate sugar (${sugarG}g per 100g)`);
    else if (sugarG <= 5) pushUnique(reasons, `Relatively low sugar (${sugarG}g per 100g)`);
  }

  if (typeof protein === "number") {
    if (protein >= 15) pushUnique(reasons, `Good protein density (${protein}g per 100g)`);
    else if (protein < 6) pushUnique(reasons, `Low protein (${protein}g per 100g)`);
  }

  if (typeof fiber === "number" && fiber >= 5) {
    pushUnique(reasons, `Decent fibre (${fiber}g per 100g)`);
  }

  if (typeof sodium === "number" && sodium >= 500) {
    pushUnique(reasons, `High sodium (${sodium}mg per 100g)`);
  }

  if (typeof kcal === "number" && kcal >= 450) {
    pushUnique(reasons, `Calorie-dense (${kcal} kcal per 100g)`);
  }

  const flagged = matchAdditives(opts.ingredients_raw).filter(
    (m) => m.tier === "moderate" || m.tier === "hazardous",
  );
  if (flagged.length) {
    const names = flagged.slice(0, 2).map((m) => m.name);
    pushUnique(
      reasons,
      flagged.length === 1
        ? `Flagged additive: ${names[0]}`
        : `Flagged additives (${flagged.length}), including ${names.join(", ")}`,
    );
  }

  for (const c of opts.concerns ?? []) {
    const entry = c as ConcernEntry & { message?: string };
    const name = entry.ingredient ?? entry.message;
    if (name && flagged.length === 0) {
      pushUnique(reasons, `Worth noting: ${name}`);
    }
  }

  if (subs && subs.nutrition < 28) pushUnique(reasons, "Nutrition profile is below typical for this aisle");
  if (subs && subs.additives < 18) pushUnique(reasons, "Additives pulled the score down");
  if (opts.breakdown?.hard_capped) pushUnique(reasons, "A high-risk additive capped the top score");

  const marketing =
    (opts.productName ?? "") +
    (typeof opts.breakdown === "object" && opts.breakdown && "notes" in opts.breakdown
      ? (opts.breakdown.notes ?? []).join(" ")
      : "");
  if (/protein|zero sugar|no added sugar|multigrain|healthy|diet/i.test(marketing)) {
    if (typeof protein === "number" && protein < 10 && /protein/i.test(marketing)) {
      pushUnique(reasons, `Marketed as high protein, but only ${protein}g per 100g on the label`);
    }
    if (sugarG != null && sugarG > 12 && /zero sugar|no added sugar/i.test(marketing)) {
      pushUnique(reasons, "Sugar claim on pack doesn't match the label numbers");
    }
  }

  if (reasons.length === 0) {
    pushUnique(reasons, `${labelForBand(opts.band)} overall for this category`);
  }

  const tradeoffs: string[] = [];
  if (opts.band === "excellent" || opts.band === "good") {
    tradeoffs.push("Works well as a regular buy if the price and taste suit you.");
    if (sugarG != null && sugarG > 8) {
      tradeoffs.push("Still a packaged item — portion size matters if you're cutting sugar.");
    }
  } else if (opts.band === "poor" || opts.band === "bad") {
    tradeoffs.push("Fine once in a while — just don't treat it as your default staple.");
    tradeoffs.push("Check the swaps beside this score for similar options in the same aisle.");
  } else {
    tradeoffs.push("Mixed bag: fine for taste or convenience, not ideal as an everyday base.");
    tradeoffs.push("Compare swaps if you want something cleaner without changing aisles.");
  }

  return {
    reasons: reasons.slice(0, 3),
    tradeoffs: tradeoffs.slice(0, 2),
  };
}
