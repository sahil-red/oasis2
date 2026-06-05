import { PROMPT_ROTATION_MS } from "@/lib/catalog/example-prompts";

/** Landing sections rotate on the same cadence as search prompt chips. */
export const LANDING_ROTATION_MS = PROMPT_ROTATION_MS;

export function landingRotationSlot(now = Date.now()): number {
  return Math.floor(now / LANDING_ROTATION_MS);
}

/** Pick `count` consecutive items from `pool`, starting index shifts each rotation slot. */
export function pickRotatingSlice<T>(
  pool: T[],
  count: number,
  opts?: { slot?: number; slotOffset?: number },
): T[] {
  if (!pool.length) return [];
  if (pool.length <= count) return pool.slice(0, count);
  const slot = (opts?.slot ?? landingRotationSlot()) + (opts?.slotOffset ?? 0);
  const start = ((slot * count) % pool.length + pool.length) % pool.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(start + i) % pool.length]!);
  }
  return out;
}
