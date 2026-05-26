import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PIPELINE_DIR = join(REPO_ROOT, "ocr-pipeline");
const DEFAULT_VENV_PYTHON = join(PIPELINE_DIR, ".venv/bin/python");

function pythonBin(): string {
  return process.env.OCR_PIPELINE_PYTHON?.trim() || DEFAULT_VENV_PYTHON;
}

export type LivetextOcrResult = {
  full_text: string;
  framework: "livetext";
  unit: "line";
};

type LivetextResponse = {
  ok?: boolean;
  error?: string;
  full_text?: string;
  framework?: string;
  unit?: string;
};

type QueueWaiter =
  | { kind: "ping"; resolve: () => void; reject: (e: Error) => void }
  | {
      kind: "ocr";
      resolve: (r: LivetextOcrResult) => void;
      reject: (e: Error) => void;
    };

/** Ephemeral path — deleted after OCR (no .tmp/ocr-livetext cache). */
async function downloadImageTemp(imageUrl: string): Promise<string> {
  const hash = createHash("sha256").update(imageUrl.trim()).digest("hex").slice(0, 20);
  const tmpPath = join(tmpdir(), `scout-livetext-${hash}-${Date.now()}.jpg`);
  const res = await fetch(imageUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ScoutOCR/1.0)" },
  });
  if (!res.ok) throw new Error(`image fetch ${res.status} ${imageUrl.slice(0, 80)}`);
  await mkdir(tmpdir(), { recursive: true });
  await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
  return tmpPath;
}

async function removeTempFile(path: string): Promise<void> {
  await unlink(path).catch(() => {});
}

/** Persistent Python worker — one LiveText / PyObjC load per Node process. */
class LivetextOcrServer {
  proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private queue: QueueWaiter[] = [];
  private starting: Promise<void> | null = null;

  private reset(reason: string): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.starting = null;
    this.buf = "";
    while (this.queue.length) {
      const w = this.queue.shift()!;
      w.reject(new Error(reason));
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc) return;
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve, reject) => {
      const py = pythonBin();
      const script = join(PIPELINE_DIR, "livetext_extract.py");
      const child = spawn(py, [script, "--server"], {
        cwd: PIPELINE_DIR,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.proc = child;

      child.stdout.on("data", (chunk) => {
        this.buf += String(chunk);
        let idx: number;
        while ((idx = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, idx).trim();
          this.buf = this.buf.slice(idx + 1);
          if (!line) continue;
          const waiter = this.queue.shift();
          if (!waiter) continue;
          try {
            const parsed = JSON.parse(line) as LivetextResponse;
            if (waiter.kind === "ping") {
              if (parsed.ok) waiter.resolve();
              else waiter.reject(new Error(parsed.error ?? "livetext ping failed"));
              continue;
            }
            if (!parsed.ok) {
              waiter.reject(new Error(parsed.error ?? "livetext failed"));
              continue;
            }
            waiter.resolve({
              full_text: parsed.full_text ?? "",
              framework: "livetext",
              unit: "line",
            });
          } catch (e) {
            waiter.reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
      });

      child.stderr.on("data", (chunk) => {
        const msg = String(chunk);
        if (msg.includes("Terminating app due to uncaught exception")) {
          this.reset("livetext server crashed (PyObjC)");
        }
      });

      child.on("error", (e) => {
        this.reset(String(e));
        reject(e instanceof Error ? e : new Error(String(e)));
      });

      child.on("close", (code) => {
        this.reset(`livetext server exited (${code})`);
        reject(new Error(`livetext server exited (${code})`));
      });

      this.queue.push({
        kind: "ping",
        resolve: () => resolve(),
        reject,
      });
      child.stdin.write(`${JSON.stringify({ cmd: "ping" })}\n`);
    });

    return this.starting.catch(() => {
      this.starting = null;
    });
  }

  async ocrPath(imagePath: string): Promise<LivetextOcrResult> {
    try {
      await this.ensureStarted();
      if (!this.proc?.stdin) throw new Error("livetext server not running");

      return await new Promise<LivetextOcrResult>((resolve, reject) => {
        this.queue.push({ kind: "ocr", resolve, reject });
        this.proc!.stdin.write(`${JSON.stringify({ path: imagePath })}\n`, (err) => {
          if (err) reject(err);
        });
      });
    } catch (e) {
      this.reset("livetext retry after failure");
      await this.ensureStarted();
      return new Promise<LivetextOcrResult>((resolve, reject) => {
        this.queue.push({ kind: "ocr", resolve, reject });
        this.proc!.stdin.write(`${JSON.stringify({ path: imagePath })}\n`, (err) => {
          if (err) reject(err);
        });
      });
    }
  }
}

let server: LivetextOcrServer | null = null;

function getServer(): LivetextOcrServer {
  if (!server) server = new LivetextOcrServer();
  return server;
}

export async function livetextFromPath(imagePath: string): Promise<LivetextOcrResult> {
  return getServer().ocrPath(imagePath);
}

/** Download → OCR → delete temp image immediately (zero disk footprint). */
export async function livetextFromUrl(imageUrl: string): Promise<LivetextOcrResult> {
  const tmpPath = await downloadImageTemp(imageUrl);
  try {
    return await livetextFromPath(tmpPath);
  } finally {
    await removeTempFile(tmpPath);
  }
}

export async function shutdownLivetextOcr(): Promise<void> {
  if (server?.proc) server.proc.kill();
  server = null;
}
