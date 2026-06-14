/**
 * Scout's shared motif vocabulary — one hand-drawn botanical language used across
 * every page (home, catalog, insights, cart) so the product feels like one crafted
 * thing. All decorative: aria-hidden, pointer-events-none, currentColor so callers
 * tint via text-(--color-…). Pair with the ring glyph (ring-motif.tsx) + the cats.
 */

/** Small leaf sprig — a section/footer/empty-state accent. */
export function Sprig({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 120" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M33 116 C33 86 28 50 38 8" />
        <path d="M33 92 C16 89 10 73 15 61 C32 65 38 80 33 92 Z" />
        <path d="M35 68 C52 63 58 47 52 36 C36 41 31 57 35 68 Z" />
        <path d="M34 46 C20 43 15 30 19 21 C33 25 38 37 34 46 Z" />
      </g>
    </svg>
  );
}

/** Half-cut citrus — echoes the catalog backdrop; good for empty states / margins. */
export function CitrusHalf({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 96" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20 H138" />
        <path d="M16 20 Q75 104 134 20" />
        <path d="M27 26 Q75 88 123 26" />
        <path d="M75 24 L40 44" /><path d="M75 24 L55 60" /><path d="M75 24 L75 68" />
        <path d="M75 24 L95 60" /><path d="M75 24 L110 44" />
      </g>
    </svg>
  );
}

/** A wheat / grain sprig — third botanical, for variety. */
export function Wheat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 130" fill="none" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 128 V44" />
        {[0, 1, 2, 3].map((r) => (
          <g key={r} transform={`translate(0 ${r * 20})`}>
            <path d="M24 40 C14 36 10 26 13 18 C21 22 26 30 24 40 Z" />
            <path d="M24 40 C34 36 38 26 35 18 C27 22 22 30 24 40 Z" />
          </g>
        ))}
        <path d="M24 44 C18 40 12 40 8 44 M24 44 C30 40 36 40 40 44" />
      </g>
    </svg>
  );
}

/**
 * An editorial section rule — a centre-fading hairline, optionally with a tiny
 * sprig sitting on it. Replaces raw vertical whitespace between sections.
 */
export function SectionRule({ className = "", sprig = false }: { className?: string; sprig?: boolean }) {
  return (
    <div aria-hidden className={`relative flex items-center justify-center ${className}`}>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-(--color-line-strong) to-transparent" />
      {sprig ? (
        <span className="absolute grid place-items-center rounded-full bg-(--color-bg) px-3">
          <Sprig className="h-5 w-[14px] text-(--color-fg-dim) opacity-70" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * A hand-drawn underline that stretches to its parent's width — Scout's signature
 * flourish under a key serif headline. Place inside a relative inline-block wrapper
 * with the heading; absolutely positioned just under the baseline.
 */
export function SketchUnderline({ className = "", color = "var(--color-accent)" }: { className?: string; color?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 12"
      preserveAspectRatio="none"
      fill="none"
      className={`pointer-events-none ${className}`}
    >
      <path
        d="M3 7.5 C40 3.5 90 3 130 5.5 C160 7.2 180 8 197 5"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
