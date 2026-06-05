/** Rotate example search chips every 15 minutes (same cadence as web). */
export const PROMPT_ROTATION_MS = 15 * 60 * 1000;

export const PROMPTS_PER_VIEW = 11;

const SHORT_PROMPTS = [
  "zero sugar soft drinks",
  "ghee from grass fed cows",
  "low sugar biscuits",
  "high protein curd under ₹100",
  "millet based snacks",
  "chips without palm oil",
  "dark chocolate no added sugar",
  "greek yogurt high protein",
  "low sodium snacks",
  "vegan protein snacks",
  "sugar free chocolate",
  "healthy namkeen low fat",
  "paneer with low fat under ₹150",
  "oats without added sugar",
  "juice no added sugar no preservatives",
  "peanut butter without palm oil",
  "keto friendly snacks",
  "almond milk no added sugar",
  "low fat paneer for diet",
  "multigrain bread no maida",
  "tofu high protein vegetarian",
];

export function promptRotationSlot(now = Date.now()): number {
  return Math.floor(now / PROMPT_ROTATION_MS);
}

export function getRotatingPrompts(opts?: {
  slot?: number;
  count?: number;
  now?: number;
}): string[] {
  const count = opts?.count ?? PROMPTS_PER_VIEW;
  const slot = opts?.slot ?? promptRotationSlot(opts?.now);
  const start = (slot * count) % SHORT_PROMPTS.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(SHORT_PROMPTS[(start + i) % SHORT_PROMPTS.length]!);
  }
  return out;
}

export function getDayPrompts(): string[] {
  return getRotatingPrompts();
}
