"use client";

import { useEffect, useState } from "react";
import {
  clearAiSearchPreferences,
  emptyAiSearchPreferences,
  hasSavedPreferences,
  savedPreferencePhrases,
  writeAiSearchPreferences,
  type AiSearchPreferences,
} from "@/lib/search/ai-usage";

const HEALTH_OPTIONS: { id: string; label: string }[] = [
  { id: "fat_loss", label: "Diet / fat loss" },
  { id: "diabetic", label: "Diabetes" },
  { id: "pcos", label: "PCOS" },
  { id: "gym", label: "Gym" },
  { id: "kids", label: "Kids" },
  { id: "bulk", label: "Bulking" },
];

type Props = {
  prefs: AiSearchPreferences | null;
  onChange: (prefs: AiSearchPreferences) => void;
};

export function AiSavedPreferencesHint({ prefs, onChange }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);

  if (!prefs || !hasSavedPreferences(prefs)) return null;

  const phrases = savedPreferencePhrases(prefs);

  return (
    <div className="mt-1 text-[11px] leading-relaxed text-(--color-fg-dim)">
      <span>AI search also uses saved preferences: </span>
      {phrases.map((phrase, i) => (
        <span key={phrase}>
          {i > 0 ? ", " : null}
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="text-(--color-fg-muted) underline decoration-(--color-line-strong) underline-offset-2 transition hover:text-(--color-fg)"
          >
            {phrase}
          </button>
        </span>
      ))}
      <span> · </span>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="font-medium text-(--color-fg-muted) underline decoration-(--color-line-strong) underline-offset-2 hover:text-(--color-fg)"
      >
        Edit
      </button>
      <span> · </span>
      <button
        type="button"
        onClick={() => {
          clearAiSearchPreferences();
          onChange(emptyAiSearchPreferences());
          setEditorOpen(false);
        }}
        className="text-(--color-fg-dim) underline decoration-(--color-line) underline-offset-2 hover:text-(--color-fg-muted)"
      >
        Clear
      </button>
      {editorOpen ? (
        <AiSearchPreferencesEditor
          initial={prefs}
          onSave={(next) => {
            writeAiSearchPreferences(next);
            onChange(next);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function AiSearchPreferencesEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: AiSearchPreferences;
  onSave: (prefs: AiSearchPreferences) => void;
  onClose: () => void;
}) {
  const [diet, setDiet] = useState<"" | "vegetarian" | "vegan">(
    initial.diet === "vegan" ? "vegan" : initial.diet === "vegetarian" ? "vegetarian" : "",
  );
  const [health, setHealth] = useState<Set<string>>(new Set(initial.healthContexts ?? []));
  const [avoid, setAvoid] = useState((initial.avoidIngredients ?? []).join(", "));
  const [budget, setBudget] = useState(
    initial.budget != null && initial.budget > 0 ? String(initial.budget) : "",
  );

  useEffect(() => {
    setDiet(
      initial.diet === "vegan" ? "vegan" : initial.diet === "vegetarian" ? "vegetarian" : "",
    );
    setHealth(new Set(initial.healthContexts ?? []));
    setAvoid((initial.avoidIngredients ?? []).join(", "));
    setBudget(initial.budget != null && initial.budget > 0 ? String(initial.budget) : "");
  }, [initial]);

  const toggleHealth = (id: string) => {
    setHealth((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const budgetNum = budget.trim() ? Number(budget.trim()) : null;
    const avoidIngredients = avoid
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({
      diet: diet || undefined,
      healthContexts: health.size ? [...health] : undefined,
      avoidIngredients: avoidIngredients.length ? avoidIngredients : undefined,
      budget: budgetNum != null && Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : null,
    });
  };

  return (
    <div
      className="mt-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-3 shadow-sm"
      role="dialog"
      aria-label="Edit saved AI search preferences"
    >
      <p className="text-[11px] text-(--color-fg-muted)">
        These apply automatically to every AI search on this device (added after your typed query).
        Saved when you tap <strong className="font-medium text-(--color-fg)">Save preferences</strong>{" "}
        on a search result.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px]">
          <span className="font-medium text-(--color-fg-muted)">Diet</span>
          <select
            value={diet}
            onChange={(e) => setDiet(e.target.value as "" | "vegetarian" | "vegan")}
            className="mt-1 w-full rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1.5 text-[12px] text-(--color-fg)"
          >
            <option value="">No preference</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option>
          </select>
        </label>
        <label className="block text-[11px]">
          <span className="font-medium text-(--color-fg-muted)">Budget (max ₹)</span>
          <input
            type="number"
            min={1}
            placeholder="e.g. 150"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-1 w-full rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1.5 text-[12px] text-(--color-fg)"
          />
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-[11px] font-medium text-(--color-fg-muted)">Health goals</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {HEALTH_OPTIONS.map((opt) => {
            const active = health.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleHealth(opt.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                  active
                    ? "border-(--color-fg) bg-(--color-fg) text-(--color-bg)"
                    : "border-(--color-line) text-(--color-fg-muted) hover:border-(--color-fg-dim)"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="mt-3 block text-[11px]">
        <span className="font-medium text-(--color-fg-muted)">Avoid ingredients</span>
        <input
          type="text"
          placeholder="palm oil, maida, …"
          value={avoid}
          onChange={(e) => setAvoid(e.target.value)}
          className="mt-1 w-full rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1.5 text-[12px] text-(--color-fg)"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-full bg-(--color-fg) px-3 py-1 text-[11px] font-medium text-(--color-bg)"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-(--color-line) px-3 py-1 text-[11px] text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
