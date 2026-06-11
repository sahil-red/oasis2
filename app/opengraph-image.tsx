import { ImageResponse } from "next/og";

/**
 * Social card (X / WhatsApp / iMessage). Generated at build time and cached as
 * a static asset — the font fetch below runs in the build env, never per-request.
 * Colors are literal (Satori can't read CSS vars): warm paper light theme.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Scout — we read the back label so you don't have to. Honest grocery intel for India.";

const PAPER = "#faf7f2";
const INK = "#1c1612";
const MUTED = "#5e544b";
const DIM = "#8a7f74";
const LINE = "rgba(60, 40, 20, 0.14)";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";

async function instrumentSerif(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap",
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

function ScorePill({
  score,
  label,
  color,
}: {
  score: number;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 26px 16px 18px",
        borderRadius: 999,
        backgroundColor: "#ffffff",
        border: `1px solid ${LINE}`,
        boxShadow: "0 2px 10px rgba(60, 40, 20, 0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 52,
          height: 52,
          borderRadius: 999,
          backgroundColor: color,
          color: "#ffffff",
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {score}
      </div>
      <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{label}</div>
    </div>
  );
}

export default async function OgImage() {
  const serif = await instrumentSerif();
  const display = serif ? "Instrument Serif" : "serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PAPER,
          padding: "64px 72px 56px",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: INK,
              color: "#ffffff",
              fontFamily: display,
              fontSize: 34,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", fontFamily: display, fontSize: 44, color: INK }}>
            Scout
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontFamily: display,
              fontSize: 76,
              lineHeight: 1.08,
              color: INK,
              letterSpacing: -1,
              maxWidth: 980,
            }}
          >
            We read the back label so you don&apos;t have to.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
            Verdicts, swaps, and what to skip — for everything in your basket.
          </div>
        </div>

        {/* Score pills + footer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", gap: 18 }}>
            <ScorePill score={82} label="Daily staple" color={GREEN} />
            <ScorePill score={54} label="Once in a while" color={AMBER} />
            <ScorePill score={21} label="Skip it" color={RED} />
          </div>
          <div style={{ display: "flex", fontSize: 22, color: DIM }}>
            Honest grocery intel for India · Independent. Opinionated.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: serif
        ? [{ name: "Instrument Serif", data: serif, style: "normal" as const, weight: 400 as const }]
        : undefined,
    },
  );
}
