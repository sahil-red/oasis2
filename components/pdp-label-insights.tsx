import { cn } from "@/lib/utils";

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
  className,
}: {
  deepseek: DeepseekFacts | null;
  className?: string;
}) {
  if (!deepseek) return null;

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
  if (!hasFacts) return null;

  return (
    <section className={cn("rounded-xl border border-(--color-line) bg-(--color-bg-soft) p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
        Other information
      </p>
      <div className="mt-4 space-y-3">
        <FactLine label="Allergens" value={allergenText || null} />
        <FactLine label="Storage" value={storageText} />
        <FactLine label="Claims" value={claims.join(", ")} />
      </div>
    </section>
  );
}
