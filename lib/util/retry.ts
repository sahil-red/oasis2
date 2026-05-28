export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 2000;
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts) break;
      const delay = baseDelayMs * i;
      console.warn(
        `[retry] ${label} failed (${i}/${attempts}): ${e instanceof Error ? e.message : e} — retry in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}
