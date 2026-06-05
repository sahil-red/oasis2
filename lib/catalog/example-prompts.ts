/** Rotate example search chips every 15 minutes (client + SSR-safe slot math). */
export const PROMPT_ROTATION_MS = 15 * 60 * 1000;

export const PROMPTS_PER_VIEW = 11;

const MAX_PROMPT_LENGTH = 36;

export const ALL_PROMPT_EXAMPLES = [
  "biscuits with low sugar",
  "paneer with low fat under ₹150",
  "high protein snacks for gym",
  "kids snacks without artificial colours",
  "zero sugar soft drinks",
  "diabetic friendly breakfast cereals",
  "oats without added sugar",
  "clean protein bars no artificial sweeteners",
  "full cream milk high protein",
  "ghee from grass fed cows",
  "chips without palm oil",
  "curd high protein low fat",
  "dark chocolate no added sugar",
  "multigrain bread no maida",
  "protein powder for bulking",
  "juice no added sugar no preservatives",
  "peanut butter without palm oil",
  "greek yogurt high protein",
  "baby food no preservatives no colours",
  "green tea without artificial flavours",
  "low sodium snacks",
  "vegan protein snacks",
  "keto friendly snacks",
  "cheese with no preservatives",
  "muesli without added sugar",
  "rice cakes low calorie",
  "almond milk no added sugar",
  "coconut water natural no sugar",
  "energy bars without high fructose corn syrup",
  "tofu high protein vegetarian",
  "instant oats no added flavours",
  "low carb bread",
  "whey protein isolate",
  "seeds and nuts mix no salt",
  "cold pressed juice no preservatives",
  "kombucha low sugar",
  "sourdough bread no maida",
  "chickpea snacks high protein",
  "trail mix no added sugar",
  "probiotic yogurt no artificial flavours",
  "dal high protein low price",
  "sprouts mix protein rich",
  "quinoa for weight loss",
  "flax seeds omega 3",
  "plant based milk alternatives",
  "sugar free chocolate",
  "healthy namkeen low fat",
  "ragi biscuits for kids",
  "millet based snacks",
  "low fat paneer for diet",
];

const SHORT_PROMPTS = ALL_PROMPT_EXAMPLES.filter((p) => p.length <= MAX_PROMPT_LENGTH);

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

/** @deprecated Use getRotatingPrompts — kept for callers expecting daily name. */
export function getDayPrompts(): string[] {
  return getRotatingPrompts();
}
