import type { FieldProvenance, ProductProvenance } from "@/lib/products/data-provenance";
import { formatDeepseekChip } from "@/lib/ocr/deepseek-promote";

type DeepseekFacts = Record<string, unknown>;

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

function confidenceLabel(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  return [
    record.overall ? `overall ${record.overall}` : null,
    record.nutrition ? `nutrition ${record.nutrition}` : null,
    record.ingredients ? `ingredients ${record.ingredients}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;
}

function FactRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">{label}</dt>
      <dd className="mt-1 text-sm text-(--color-fg)">{value}</dd>
    </div>
  );
}

function DeepseekFactPanel({ facts }: { facts: DeepseekFacts }) {
  const extracted = asRecord(facts.extracted);
  const allergens = asRecord(extracted?.allergens);
  const storage = asRecord(extracted?.storage_and_shelf_life);
  const usage = asRecord(extracted?.usage);
  const model = typeof facts.model === "string" ? facts.model : null;
  const extractedAt = typeof facts.extracted_at === "string" ? facts.extracted_at : null;
  const validation = asRecord(facts.validation);
  const chips = stringList(facts.chips).map(formatDeepseekChip);
  const why = typeof facts.why === "string" ? facts.why : null;
  const marketingClaims = stringList(extracted?.marketing_claims);
  const contains = stringList(allergens?.contains);
  const mayContain = stringList(allergens?.may_contain);
  const freeFrom = stringList(allergens?.free_from_claims);
  const storageInstructions =
    typeof storage?.storage_instructions === "string" ? storage.storage_instructions : null;
  const servingSuggestion =
    typeof usage?.serving_suggestion === "string" ? usage.serving_suggestion : null;
  const dosage =
    typeof usage?.recommended_dosage === "string" ? usage.recommended_dosage : null;

  return (
    <div className="rounded-xl bg-(--color-bg-soft) px-4 py-3 ring-1 ring-(--color-line)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
            DeepSeek extraction
          </dt>
          <dd className="mt-1 text-sm font-medium text-(--color-fg)">
            {model ?? "DeepSeek label JSON"}
          </dd>
          {extractedAt ? (
            <dd className="mt-0.5 text-[11px] text-(--color-fg-muted)">
              {new Date(extractedAt).toLocaleString()}
            </dd>
          ) : null}
        </div>
        <div className="text-right text-[11px] text-(--color-fg-muted)">
          {validation?.ok === false ? "Needs review" : "Validation OK"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FactRow label="Confidence" value={confidenceLabel(facts.confidence)} />
        <FactRow label="Chips" value={chips.join(", ")} />
        <FactRow label="Allergens" value={contains.join(", ")} />
        <FactRow label="May contain" value={mayContain.join(", ")} />
        <FactRow label="Free from" value={freeFrom.join(", ")} />
        <FactRow label="Storage" value={storageInstructions} />
        <FactRow label="Serving" value={servingSuggestion} />
        <FactRow label="Dosage" value={dosage} />
        <FactRow label="Claims" value={marketingClaims.join(", ")} />
      </div>

      {why ? (
        <p className="mt-4 text-[12px] leading-relaxed text-(--color-fg-muted)">{why}</p>
      ) : null}
    </div>
  );
}

export function PdpSourceDataPanel({
  provenance,
  cohortSize,
  relativeScore,
  roleCohort,
  deepseek,
}: {
  provenance: ProductProvenance;
  cohortSize?: number | null;
  relativeScore?: number | null;
  roleCohort?: string | null;
  deepseek?: DeepseekFacts | null;
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
    <div className="space-y-2">
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
      {deepseek ? (
        <dl>
          <DeepseekFactPanel facts={deepseek} />
        </dl>
      ) : null}
    </div>
  );
}
