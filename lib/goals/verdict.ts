import { bandFromScore, gradeFromScore, labelForBand, type ScoreBand } from "@/lib/utils";

export type FitVerdict = "strong" | "okay" | "weak";

export function fitVerdict(fit: number): FitVerdict {
  if (fit >= 70) return "strong";
  if (fit >= 45) return "okay";
  return "weak";
}

export function fitVerdictLabel(v: FitVerdict): string {
  switch (v) {
    case "strong":
      return "Strong pick";
    case "okay":
      return "Okay";
    case "weak":
      return "Weak fit";
  }
}

export function scorePresentation(fit: number) {
  return {
    fit,
    grade: gradeFromScore(fit),
    band: bandFromScore(fit),
    bandLabel: labelForBand(bandFromScore(fit)),
    verdict: fitVerdict(fit),
    verdictLabel: fitVerdictLabel(fitVerdict(fit)),
  };
}
