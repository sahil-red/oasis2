import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import { ScoreRing } from "@/components/score-ring";
import { StatCard } from "@/components/stat-card";
import { Section, Eyebrow, H2 } from "@/components/section";
import { Faq } from "@/components/faq";
import { FeatureStep } from "@/components/feature-step";

const HERO_STATS = [
  { label: "Sugar", value: "14g", caption: "Above WHO daily guideline", tone: "bad" as const, delay: 80 },
  { label: "Additives", value: "7", caption: "Including 2 with research concerns", tone: "warn" as const, delay: 160 },
  { label: "Sodium", value: "640mg", caption: "27% of daily limit per serving", tone: "warn" as const, delay: 240 },
  { label: "NOVA Group", value: "4", caption: "Ultra-processed", tone: "bad" as const, delay: 320 },
  { label: "Allergens", value: "Wheat · Soy", caption: "Contains gluten", tone: "neutral" as const, delay: 400 },
  { label: "Nutri-Score", value: "D", caption: "Below average nutritional profile", tone: "warn" as const, delay: 480 },
];

const RESEARCH = [
  {
    tag: "Additives",
    title: "Why bromated flour is banned in 9 countries",
    href: "#",
  },
  {
    tag: "Sweeteners",
    title: "Sucralose, gut microbiome, and what the latest 2025 review says",
    href: "#",
  },
  {
    tag: "Oils",
    title: "How refined palm oil shows up in 6 out of 10 Indian snacks",
    href: "#",
  },
  {
    tag: "Labels",
    title: "The difference between FSSAI's 'no added sugar' and 'sugar-free'",
    href: "#",
  },
  {
    tag: "Preservatives",
    title: "Sodium benzoate + vitamin C: a chemistry you should know",
    href: "#",
  },
  {
    tag: "Plastics",
    title: "BPA-free isn't always safer — what replaced it",
    href: "#",
  },
];

const FAQ = [
  {
    q: "Where does the ingredient data come from?",
    a: "We combine three sources: the structured ingredient field from Zepto's product pages, OCR of the back-label photo when that's missing, and Open Food Facts for verified barcodes. Each ingredient on a product page shows its source.",
  },
  {
    q: "How is the Core score calculated?",
    a: "It's a hybrid: a curated rules table penalises known additives of concern (with cited evidence), Open Food Facts contributes NOVA and Nutri-Score signals, and unknown ingredients get classified by an LLM that we cache per ingredient. The breakdown is visible on every product page.",
  },
  {
    q: "Do you test products in a lab?",
    a: "No. This is an independent research project, not a testing facility. We attribute every claim to a citation and flag ingredient-level concerns based on published guidance from EWG, WHO, FSSAI and peer-reviewed studies.",
  },
  {
    q: "Will the score change for the same product over time?",
    a: "Yes. We version the scoring rules so older scores remain reproducible, and recompute when ingredients change or new evidence is added.",
  },
  {
    q: "Can I report a wrong ingredient or score?",
    a: "Soon. Each product page will have a 'flag this' button that opens a structured form. For now, please open an issue on the repo.",
  },
];

export default function Home() {
  return (
    <main className="relative">
      <Nav />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-12 md:pt-36 md:pb-16">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Eyebrow>Independent · India · Research-backed</Eyebrow>
              <h1 className="font-display mt-5 text-balance text-5xl leading-[0.95] md:text-7xl">
                See what&apos;s really
                <br />
                <span className="italic text-(--color-accent)">inside</span> your products.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-(--color-fg-muted)">
                Browse Indian grocery products with full ingredient breakdowns,
                additive concerns, and a transparent Core safety score — backed by
                Blinkit catalog data and label OCR.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/search"
                  className="group inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-5 py-3 text-sm font-medium text-(--color-bg) transition-transform hover:-translate-y-0.5"
                >
                  Browse the catalog
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 rounded-full border border-(--color-line) px-5 py-3 text-sm text-(--color-fg-muted) transition-colors hover:text-(--color-fg)"
                >
                  How it works
                </Link>
              </div>
              <div className="mt-12 flex items-center gap-6 text-sm text-(--color-fg-dim)">
                <span>Built with</span>
                <span className="text-(--color-fg-muted)">Open Food Facts</span>
                <span className="text-(--color-fg-muted)">Blinkit catalog</span>
                <span className="text-(--color-fg-muted)">Gemini</span>
              </div>
            </div>

            {/* Hero score card */}
            <div className="relative">
              <div className="glass relative overflow-hidden rounded-3xl p-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-(--color-fg-muted)">
                      Sample analysis
                    </div>
                    <div className="font-display mt-2 text-2xl">
                      Instant Noodles · 70g
                    </div>
                    <div className="mt-1 text-sm text-(--color-fg-dim)">
                      Random masala variant · sample only
                    </div>
                  </div>
                  <ScoreRing score={42} size={160} stroke={11} delay={300} />
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  {HERO_STATS.slice(0, 4).map((s) => (
                    <StatCard key={s.label} {...s} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {HERO_STATS.slice(4).map((s) => (
                    <StatCard key={s.label} {...s} />
                  ))}
                </div>
              </div>
              <div className="pointer-events-none absolute -inset-x-12 -bottom-16 -z-10 h-40 rounded-full bg-(--color-accent-soft) blur-3xl" />
            </div>
          </div>
        </div>
        <div className="hairline mx-auto max-w-6xl" />
      </section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works">
        <Eyebrow>How it works</Eyebrow>
        <H2>Three steps, zero guesswork.</H2>
        <p className="mt-6 max-w-2xl text-(--color-fg-muted)">
          We do the boring archaeology — scraping labels, OCRing the fine print,
          cross-referencing public food databases — so you can shop in five seconds.
        </p>
        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          <FeatureStep
            index={1}
            icon="scan"
            title="Search any product."
            body="Type a brand, an SKU, or paste a Zepto link. Our index covers thousands of Indian grocery items, refreshed weekly."
            delay={0}
          />
          <FeatureStep
            index={2}
            icon="sparkles"
            title="See the full breakdown."
            body="Every additive, every concern, every citation. No marketing language — just the ingredient list and what published research actually says about it."
            delay={120}
          />
          <FeatureStep
            index={3}
            icon="shield"
            title="Make a safer call."
            body="The Core score puts it all on one transparent 0–100 dial. Find a swap in the same category that scores higher, in one tap."
            delay={240}
          />
        </div>
      </Section>

      {/* RESEARCH */}
      <Section>
        <div className="flex items-end justify-between gap-6">
          <div>
            <Eyebrow>Research</Eyebrow>
            <H2>What we&apos;ve been reading.</H2>
          </div>
          <Link
            href="/blog"
            className="hidden items-center gap-1 text-sm text-(--color-fg-muted) hover:text-(--color-fg) md:inline-flex"
          >
            All articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-line) md:grid-cols-3">
          {RESEARCH.map((r) => (
            <Link
              key={r.title}
              href={r.href}
              className="group bg-(--color-bg) p-7 transition-colors duration-300 hover:bg-(--color-bg-soft)"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-(--color-fg-dim)">
                {r.tag}
              </div>
              <div className="font-display mt-4 text-2xl leading-[1.15] transition-colors group-hover:text-(--color-accent)">
                {r.title}
              </div>
              <div className="mt-8 flex items-center gap-1 text-sm text-(--color-fg-muted)">
                Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq">
        <Eyebrow>FAQ</Eyebrow>
        <H2>Frequently asked.</H2>
        <div className="mt-12 max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </Section>

      {/* CTA */}
      <Section className="!py-32">
        <div className="glass relative overflow-hidden rounded-3xl p-12 md:p-20">
          <Camera className="absolute -right-10 -top-10 h-64 w-64 text-(--color-accent-soft)" />
          <Eyebrow>Get started</Eyebrow>
          <h2 className="font-display mt-3 max-w-2xl text-balance text-4xl leading-[1.05] md:text-6xl">
            One search. One score. One smarter cart.
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-6 py-3 text-sm font-medium text-(--color-bg) transition-transform hover:-translate-y-0.5"
            >
              Open the catalog <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="https://world.openfoodfacts.org/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-(--color-line) px-6 py-3 text-sm text-(--color-fg-muted) hover:text-(--color-fg)"
            >
              Why Open Food Facts
            </Link>
          </div>
        </div>
      </Section>

      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-7">
      <Link href="/" className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-(--color-fg) text-(--color-bg) grid place-items-center font-display text-base">
          o
        </div>
        <span className="font-display text-xl">Oasis</span>
      </Link>
      <div className="hidden items-center gap-7 text-sm text-(--color-fg-muted) md:flex">
        <Link href="/search" className="hover:text-(--color-fg)">
          Catalog
        </Link>
        <Link href="#how-it-works" className="hover:text-(--color-fg)">
          How it works
        </Link>
        <Link href="#faq" className="hover:text-(--color-fg)">
          FAQ
        </Link>
        <Link href="/blog" className="hover:text-(--color-fg)">
          Research
        </Link>
      </div>
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 rounded-full border border-(--color-line) px-4 py-2 text-sm text-(--color-fg) hover:border-(--color-line-strong)"
      >
        Try it <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-(--color-line) py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-(--color-fg-muted)">
          © {new Date().getFullYear()} Oasis Clone · independent research project ·{" "}
          <span className="text-(--color-fg-dim)">not affiliated with Oasis Health Inc.</span>
        </div>
        <div className="text-xs text-(--color-fg-dim)">
          Ingredient data via{" "}
          <a
            href="https://world.openfoodfacts.org/"
            className="underline decoration-(--color-line-strong) underline-offset-4"
          >
            Open Food Facts
          </a>{" "}
          (CC-BY-SA) and Zepto product pages.
        </div>
      </div>
    </footer>
  );
}
