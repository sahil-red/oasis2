import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLabelTextToPayload } from "./parse-label-text";
import type { OcrPayload } from "./types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PIPELINE_DIR = join(REPO_ROOT, "ocr-pipeline");
const DEFAULT_VENV_PYTHON = join(PIPELINE_DIR, ".venv/bin/python");
const TMP_DIR = join(REPO_ROOT, ".tmp/ocr-vision");

export type VisionOcrLine = {
  text: string;
  confidence: number;
  bbox?: unknown;
};

export type VisionOcrResult = {
  backend: string;
  recognition_level: string;
  lines: VisionOcrLine[];
  full_text: string;
  avg_confidence: number;
  actual_inference_seconds?: number;
};

function pythonBin(): string {
  const fromEnv = process.env.OCR_PIPELINE_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return DEFAULT_VENV_PYTHON;
}

function recognitionLevel(): "fast" | "accurate" {
  return process.env.OCR_VISION_LEVEL === "accurate" ? "accurate" : "fast";
}

/** Persistent Python worker — one PyObjC load for the whole Node process. */
class VisionOcrServer {
  proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private queue: Array<{
    resolve: (r: VisionOcrResult) => void;
    reject: (e: Error) => void;
  }> = [];
  private starting: Promise<void> | null = null;

  private async ensureStarted(): Promise<void> {
    if (this.proc) return;
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve, reject) => {
      const py = pythonBin();
      const script = join(PIPELINE_DIR, "ocr_server.py");
      const child = spawn(py, [script], {
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
            const parsed = JSON.parse(line) as VisionOcrResult & { error?: string };
            if (parsed.error) waiter.reject(new Error(parsed.error));
            else waiter.resolve(parsed);
          } catch (e) {
            waiter.reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
      });

      child.on("error", reject);
      child.on("close", (code) => {
        this.proc = null;
        this.starting = null;
        while (this.queue.length) {
          this.queue.shift()?.reject(new Error(`vision OCR server exited (${code})`));
        }
      });

      this.queue.push({
        resolve: () => resolve(),
        reject,
      });
      child.stdin.write(`${JSON.stringify({ cmd: "ping" })}\n`);
    });

    return this.starting;
  }

  async ocrPath(imagePath: string, level: "fast" | "accurate"): Promise<VisionOcrResult> {
    await this.ensureStarted();
    if (!this.proc?.stdin) throw new Error("vision OCR server not running");

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.proc!.stdin.write(
        `${JSON.stringify({ path: imagePath, level })}\n`,
        (err) => {
          if (err) reject(err);
        },
      );
    });
  }
}

let server: VisionOcrServer | null = null;

function getServer(): VisionOcrServer {
  if (!server) server = new VisionOcrServer();
  return server;
}

/** Raw Apple Vision OCR for a local file. No regex parsing or field extraction. */
export async function visionRawFromPath(
  imagePath: string,
  level: "fast" | "accurate" = recognitionLevel(),
): Promise<VisionOcrResult> {
  return getServer().ocrPath(imagePath, level);
}

/** OCR a local file via the warm Vision worker (no OpenCV, no double read). */
export async function visionOcrFromPath(imagePath: string): Promise<{
  payload: OcrPayload;
  raw: VisionOcrResult;
}> {
  const raw = await visionRawFromPath(imagePath);
  return toPayload(raw);
}

function urlCachePath(imageUrl: string): string {
  const hash = createHash("sha256").update(imageUrl.trim()).digest("hex").slice(0, 24);
  return join(TMP_DIR, `${hash}.jpg`);
}

/** Download once per URL, OCR the raw bytes on disk (single read by Vision). */
export async function visionOcrFromUrl(imageUrl: string): Promise<{
  payload: OcrPayload;
  raw: VisionOcrResult;
}> {
  const tmpPath = urlCachePath(imageUrl);
  await mkdir(TMP_DIR, { recursive: true });

  try {
    await access(tmpPath);
  } catch {
    const res = await fetch(imageUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ScoutOCR/1.0)" },
    });
    if (!res.ok) throw new Error(`image fetch ${res.status} ${imageUrl.slice(0, 80)}`);
    await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
  }

  return visionOcrFromPath(tmpPath);
}

function toPayload(raw: VisionOcrResult): {
  payload: OcrPayload;
  raw: VisionOcrResult;
} {
  const payload = parseLabelTextToPayload(raw.full_text, {
    avgConfidence: raw.avg_confidence,
    rawText: raw.full_text,
    backend: "vision",
    backendNote: `apple_vision inference=${raw.actual_inference_seconds ?? "?"}s level=${raw.recognition_level}`,
  });
  return { payload, raw };
}

export function visionPipelineReady(): boolean {
  return Boolean(process.env.OCR_PIPELINE_PYTHON || DEFAULT_VENV_PYTHON);
}

export async function shutdownVisionOcr(): Promise<void> {
  if (server?.proc) server.proc.kill();
  server = null;
}
