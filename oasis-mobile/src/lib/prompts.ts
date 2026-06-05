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
];

/** Same rotation as web catalog — 11 prompts per day. */
export function getDayPrompts(): string[] {
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const start = (dayIdx * 7) % SHORT_PROMPTS.length;
  const out: string[] = [];
  for (let i = 0; i < 11; i++) {
    out.push(SHORT_PROMPTS[(start + i) % SHORT_PROMPTS.length]!);
  }
  return out;
}
