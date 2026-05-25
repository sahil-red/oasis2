import { GoogleGenAI } from "@google/genai";

let cached: GoogleGenAI | null = null;

export function geminiClient(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("[gemini] GEMINI_API_KEY not set in env.");
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export function geminiTextModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
}
