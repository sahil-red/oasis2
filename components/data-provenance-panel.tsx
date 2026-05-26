import type { FieldProvenance, ProductProvenance } from "@/lib/products/data-provenance";

const KIND_STYLE: Record<
  FieldProvenance["kind"],
  { dot: string; badge: string }
> = {
  csv: {
    dot: "bg-sky-500",
    badge: "text-sky-800 bg-sky-50 ring-sky-200",
  },
  reference: {
    dot: "bg-violet-500",
    badge: "text-violet-800 bg-violet-50 ring-violet-200",
  },
  produce: {
    dot: "bg-emerald-500",
    badge: "text-emerald-800 bg-emerald-50 ring-emerald-200",
  },
  ocr: {
    dot: "bg-amber-500",
    badge: "text-amber-900 bg-amber-50 ring-amber-200",
  },
  platform: {
    dot: "bg-slate-500",
    badge: "text-slate-800 bg-slate-50 ring-slate-200",
  },
  llm: {
    dot: "bg-rose-500",
    badge: "text-rose-800 bg-rose-50 ring-rose-200",
  },
  missing: {
    dot: "bg-neutral-300",
    badge: "text-neutral-600 bg-neutral-50 ring-neutral-200",
  },
};

function ProvenanceRow({
  title,
  field,
}: {
  title: string;
  field: FieldProvenance;
}) {
  const style = KIND_STYLE[field.kind];
  return (
    <div className="rounded-xl bg-(--color-bg-soft) px-4 py-3 ring-1 ring-(--color-line)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
            {title}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
            <p className="text-sm font-medium text-(--color-fg)">{field.label}</p>
          </div>
          {field.detail ? (
            <p className="mt-1 text-xs leading-relaxed text-(--color-fg-muted)">
              {field.detail}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${style.badge}`}
        >
          {field.kind}
        </span>
      </div>
      {field.confidence != null ? (
        <p className="mt-2 text-[11px] tabular-nums text-(--color-fg-dim)">
          Confidence {Math.round(field.confidence * 100)}%
        </p>
      ) : null}
    </div>
  );
}

export function DataProvenancePanel({ provenance }: { provenance: ProductProvenance }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <ProvenanceRow title="Nutrition" field={provenance.nutrition} />
      <ProvenanceRow title="Ingredients" field={provenance.ingredients} />
    </div>
  );
}
