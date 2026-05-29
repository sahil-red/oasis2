import type { FieldProvenance, ProductProvenance } from "@/lib/products/data-provenance";

function SourceCell({
  title,
  field,
  extra,
}: {
  title: string;
  field: FieldProvenance;
  extra?: string | null;
}) {
  return (
    <div className="rounded-xl bg-(--color-bg-soft) px-4 py-3 ring-1 ring-(--color-line)">
      <dt className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">{title}</dt>
      <dd className="mt-1 text-sm font-medium text-(--color-fg)">{field.label}</dd>
      {field.detail ? (
        <dd className="mt-0.5 text-[11px] leading-snug text-(--color-fg-muted)">{field.detail}</dd>
      ) : null}
      {extra ? (
        <dd className="mt-0.5 text-[11px] tabular-nums text-(--color-fg-muted)">{extra}</dd>
      ) : null}
      {field.confidence != null ? (
        <dd className="mt-1 text-[10px] tabular-nums text-(--color-fg-dim)">
          Confidence {Math.round(field.confidence * 100)}%
        </dd>
      ) : null}
    </div>
  );
}

export function PdpSourceDataPanel({
  provenance,
  cohortSize,
  relativeScore,
  roleCohort,
}: {
  provenance: ProductProvenance;
  cohortSize?: number | null;
  relativeScore?: number | null;
  roleCohort?: string | null;
}) {
  const cohortExtra =
    cohortSize != null && cohortSize > 0
      ? [
          relativeScore != null
            ? `Top ${Math.max(1, Math.round(100 - relativeScore))}%`
            : null,
          `${cohortSize} products`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <SourceCell title="Nutrition" field={provenance.nutrition} />
      <SourceCell title="Ingredients" field={provenance.ingredients} />
      {cohortExtra ? (
        <SourceCell
          title="Scored vs aisle"
          field={{ kind: "platform", label: roleCohort ?? "Similar products" }}
          extra={cohortExtra}
        />
      ) : null}
    </dl>
  );
}
