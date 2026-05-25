import Link from "next/link";
import { Section, Eyebrow, H2 } from "@/components/section";

export default function BlogPlaceholder() {
  return (
    <main>
      <Section>
        <Eyebrow>Phase 6 · coming next</Eyebrow>
        <H2>Research.</H2>
        <p className="mt-6 max-w-2xl text-(--color-fg-muted)">
          Long-form, citation-heavy explainers will live here. We&apos;ll seed it with
          MDX articles once the core data pipeline is settled.
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 rounded-full border border-(--color-line) px-5 py-2.5 text-sm text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          ← Back home
        </Link>
      </Section>
    </main>
  );
}
