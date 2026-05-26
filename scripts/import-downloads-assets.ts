#!/usr/bin/env -S pnpm tsx
/**
 * Copy today's Downloads assets into the repo (.cache, data/cache).
 *   pnpm import:downloads
 */
import { copyFile, mkdir, readFile, appendFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const DOWNLOADS = join(homedir(), "Downloads");
const ROOT = resolve(process.cwd());

async function copyIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await access(src);
    await mkdir(join(dest, ".."), { recursive: true });
    await copyFile(src, dest);
    console.log(`  ✓ ${basename(src)} → ${dest.replace(ROOT, ".")}`);
    return true;
  } catch {
    return false;
  }
}

async function importJsonl(src: string, dest: string): Promise<number> {
  try {
    await access(src);
  } catch {
    return 0;
  }
  const text = await readFile(src, "utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  await mkdir(join(dest, ".."), { recursive: true });
  let n = 0;
  for (const line of lines) {
    JSON.parse(line);
    await appendFile(dest, `${line.trim()}\n`);
    n++;
  }
  console.log(`  ✓ merged ${n} lines from ${basename(src)} → ${dest.replace(ROOT, ".")}`);
  return n;
}

async function main() {
  console.log("[import:downloads] from", DOWNLOADS);

  await mkdir(join(ROOT, ".cache"), { recursive: true });
  await mkdir(join(ROOT, "data/cache"), { recursive: true });

  await copyIfExists(join(DOWNLOADS, "zepto-session.json"), join(ROOT, ".cache/zepto-session.json"));
  await copyIfExists(join(DOWNLOADS, "zepto-storage.json"), join(ROOT, ".cache/zepto-storage.json"));

  const jsonlCandidates = [
    "zepto-variant-images.jsonl",
    "variant-images.jsonl",
    "data.jsonl",
  ];
  for (const name of jsonlCandidates) {
    const src = join(DOWNLOADS, name);
    await importJsonl(src, join(ROOT, "data/cache/zepto-variant-images.jsonl"));
  }

  const csvDefault = join(DOWNLOADS, "cafe__1_ (5).csv");
  if (await copyIfExists(csvDefault, join(DOWNLOADS, "data.csv"))) {
    console.log("  (also copied catalog CSV as ~/Downloads/data.csv for default sync path)");
  }

  console.log("[import:downloads] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
