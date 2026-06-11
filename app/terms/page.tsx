export const metadata = { title: "Terms & Conditions · Scout" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-(--color-fg-muted)">Last updated: June 2026</p>

      <section className="mt-8 space-y-4 text-(--color-fg-muted)">
        <h2 className="font-semibold text-(--color-fg)">Use of service</h2>
        <p>Scout provides nutrition information and product recommendations. Scores are algorithmic estimates based on ingredient labels and nutrition data — not medical advice.</p>

        <h2 className="font-semibold text-(--color-fg)">AI search</h2>
        <p>Signed-in free accounts get a daily allowance of AI searches; anonymous visitors get a small free taste before sign-in. Scout Plus subscribers get unlimited AI searches. We reserve the right to adjust limits.</p>

        <h2 className="font-semibold text-(--color-fg)">Subscriptions</h2>
        <p>Scout Plus is billed monthly at ₹100 or yearly at ₹1,000 via Razorpay. Cancel anytime from your profile. No refunds for partial months.</p>

        <h2 className="font-semibold text-(--color-fg)">Disclaimer</h2>
        <p>Product data is sourced from public catalogs and may contain errors. Always check the physical label before consuming, especially for allergens.</p>
      </section>
    </main>
  );
}
