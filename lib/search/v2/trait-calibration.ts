/**
 * §3c Trait confidence calibration — reliability curve from eval set.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TraitId } from "@/lib/search/v2/types";

export type CalibrationBin = {
  trait: TraitId;
  raw_min: number;
  raw_max: number;
  observed_accuracy: number;
  n: number;
};

const CALIBRATION_PATH = join(process.cwd(), "eval", "trait-calibration.json");

let cachedBins: CalibrationBin[] | null = null;

export function loadCalibrationBins(): CalibrationBin[] {
  if (cachedBins) return cachedBins;
  if (!existsSync(CALIBRATION_PATH)) {
    cachedBins = [];
    return cachedBins;
  }
  try {
    cachedBins = JSON.parse(readFileSync(CALIBRATION_PATH, "utf8")) as CalibrationBin[];
  } catch {
    cachedBins = [];
  }
  return cachedBins!;
}

/** Map raw LLM self-reported confidence → calibrated trust (§3c). */
export function calibrateTraitConfidence(trait: TraitId, raw: number): number {
  const bins = loadCalibrationBins().filter((b) => b.trait === trait);
  if (!bins.length) {
    // §3c: conservative clamp until calibration curve exists
    return Math.min(0.72, raw * 0.85);
  }

  const bin =
    bins.find((b) => raw >= b.raw_min && raw <= b.raw_max) ??
    bins.reduce((best, b) => {
      const d = Math.abs((b.raw_min + b.raw_max) / 2 - raw);
      const bd = Math.abs((best.raw_min + best.raw_max) / 2 - raw);
      return d < bd ? b : best;
    });

  return Math.max(0, Math.min(1, bin.observed_accuracy));
}

export function saveCalibrationBins(bins: CalibrationBin[]): void {
  writeFileSync(CALIBRATION_PATH, JSON.stringify(bins, null, 2));
  cachedBins = bins;
}
