import type { DeepseekDisplayFacts } from "@/lib/ocr/deepseek-promote";

type DeepseekFacts = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function FactLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="border-t border-(--color-line) pt-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
        {label}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-(--color-fg-muted)">{value}</p>
    </div>
  );
}

export function PdpLabelInsights({
  deepseek,
  display,
}: {
  deepseek: DeepseekFacts | null;
  display: DeepseekDisplayFacts | null;
}) {
  if (!deepseek && !display) return null;

  const extracted = asRecord(deepseek?.extracted);
  const allergens = asRecord(extracted?.allergens);
  const storage = asRecord(extracted?.storage_and_shelf_life);
  const claims = stringList(extracted?.marketing_claims).slice(0, 5);
  const contains = stringList(allergens?.contains);
  const mayContain = stringList(allergens?.may_contain);
  const freeFrom = stringList(allergens?.free_from_claims);
  const storageText =
    typeof storage?.storage_instructions === "string"
      ? storage.storage_instructions
      : null;
  const allergenText = [
    contains.length ? `Contains ${contains.join(", ")}` : null,
    mayContain.length ? `May contain ${mayContain.join(", ")}` : null,
    freeFrom.length ? `Free from ${freeFrom.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasFacts = Boolean(allergenText || storageText || claims.length);

  return (
    <section className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
        Label insights
      </p>

      {display?.chipLabels.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {display.chipLabels.slice(0, 7).map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-(--color-line-strong) px-2.5 py-1 text-[11px] font-semibold leading-tight text-(--color-fg-muted)"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {display?.why ? (
        <p className="mt-3 text-[13px] leading-relaxed text-(--color-fg-muted)">
          {display.why}
        </p>
      ) : null}

      {hasFacts ? (
        <div className="mt-4 space-y-3">
          <FactLine label="Allergens" value={allergenText || null} />
          <FactLine label="Storage" value={storageText} />
          <FactLine label="Claims" value={claims.join(", ")} />
        </div>
      ) : null}
    </section>
  );
}
