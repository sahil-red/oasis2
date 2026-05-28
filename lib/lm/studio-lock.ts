import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const LOCK_DIR = resolve(process.cwd(), ".cache");
const LOCK_FILE = resolve(LOCK_DIR, "lm-studio.lock");
const DEFAULT_STALE_MS = 300_000;

async function tryAcquire(staleMs: number): Promise<boolean> {
  await mkdir(LOCK_DIR, { recursive: true });
  try {
    await writeFile(LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: "wx" });
    return true;
  } catch {
    try {
      const raw = await readFile(LOCK_FILE, "utf8");
      const [, tsRaw] = raw.split("\n");
      const ts = Number(tsRaw);
      if (Number.isFinite(ts) && Date.now() - ts > staleMs) {
        await unlink(LOCK_FILE).catch(() => {});
        return tryAcquire(staleMs);
      }
    } catch {
      /* lock file missing — retry */
    }
    return false;
  }
}

/** Serialize LM Studio calls across ocr:lm and rate:ingredients (single local model). */
export async function withLmStudioLock<T>(
  fn: () => Promise<T>,
  opts: { staleMs?: number; label?: string } = {},
): Promise<T> {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const label = opts.label ?? "lm";
  let waited = 0;
  while (!(await tryAcquire(staleMs))) {
    if (waited === 0) {
      console.warn(`[lm-lock] waiting (${label}) — another job holds LM Studio`);
    }
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
    waited++;
  }
  try {
    return await fn();
  } finally {
    await unlink(LOCK_FILE).catch(() => {});
  }
}
