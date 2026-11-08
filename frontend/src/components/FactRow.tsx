import { useState } from "react";
import type { Certainty, Fact, FactPatch } from "../api/types";
import { slotLabel } from "../labels";
import { isRaise } from "../review";
import CertaintyBadge, { CERTAINTY, ReviewChip } from "./CertaintyBadge";

const LEVELS: Certainty[] = ["confirmed", "reported", "unverified", "unknown"];

// One fact: slot · value · certainty · AI chip · ✓ · ✎ (docs/UI.md Screen 1).
export default function FactRow({
  fact,
  itemTitle,
  editable,
  busy,
  showQuote = false,
  onPatch,
}: {
  fact: Fact;
  itemTitle: string;
  editable: boolean;
  busy: boolean;
  // Review shows the verbatim quote inline so the operator checks against it.
  showQuote?: boolean;
  onPatch: (patch: FactPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const rejected = fact.review_state === "operator_rejected";

  return (
    <li className="flex flex-col gap-2 border-t border-line py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs uppercase tracking-wide text-muted">{slotLabel(fact.slot)}</span>
            <CertaintyBadge certainty={fact.certainty} />
            <ReviewChip state={fact.review_state} />
          </div>
          <p className={`mt-0.5 font-medium leading-snug ${rejected ? "text-muted line-through" : ""}`}>{fact.value}</p>
          {showQuote ? (
            <blockquote className="mt-1 border-l-2 border-line pl-2 text-sm italic text-muted">“{fact.quote}”</blockquote>
          ) : (
            <details className="mt-0.5 text-sm text-muted">
              <summary className="cursor-pointer select-none">❝ Source</summary>
              <blockquote className="mt-1 border-l-2 border-line pl-2 italic">“{fact.quote}”</blockquote>
            </details>
          )}
        </div>
        {editable && !editing && (
          <div className="flex shrink-0 gap-1">
            {fact.review_state === "ai_extracted" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPatch({ review_state: "operator_confirmed" })}
                aria-label={`Mark ${itemTitle} ${slotLabel(fact.slot)} as correct`}
                title="The AI captured this correctly. Certainty does not change."
                className="min-h-touch min-w-touch rounded-lg border-2 border-green-600/60 text-lg font-bold text-green-500 hover:bg-green-500/10 disabled:opacity-40"
              >
                ✓
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              aria-label={`Edit ${itemTitle} ${slotLabel(fact.slot)}`}
              className="min-h-touch min-w-touch rounded-lg border border-line text-lg hover:border-muted disabled:opacity-40"
            >
              ✎
            </button>
          </div>
        )}
      </div>
      {editing && (
        <FactEditor
          fact={fact}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            onPatch(patch);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

function FactEditor({
  fact,
  busy,
  onCancel,
  onSave,
}: {
  fact: Fact;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: FactPatch) => void;
}) {
  const [value, setValue] = useState(fact.value);
  const [certainty, setCertainty] = useState<Certainty>(fact.certainty);
  const [statement, setStatement] = useState("");
  const raising = isRaise(fact.certainty, certainty);
  const changed = value.trim() !== fact.value || certainty !== fact.certainty;
  const canSave = changed && value.trim() !== "" && (!raising || statement.trim() !== "");

  function save() {
    const patch: FactPatch = { review_state: "operator_edited" };
    if (value.trim() !== fact.value) patch.value = value.trim();
    if (certainty !== fact.certainty) patch.certainty = certainty;
    if (raising) patch.text = statement.trim();
    onSave(patch);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Value</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-touch rounded-lg border border-line bg-bg px-3 text-base"
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 text-muted">Certainty</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((c) => (
            <label
              key={c}
              className={`flex min-h-touch cursor-pointer items-center gap-1 rounded-lg border px-3 ${
                certainty === c ? "border-accent bg-accent/10" : "border-line"
              }`}
            >
              <input
                type="radio"
                name={`cert-${fact.id}`}
                aria-label={CERTAINTY[c].label}
                className="sr-only"
                checked={certainty === c}
                onChange={() => setCertainty(c)}
              />
              <span aria-hidden>{CERTAINTY[c].icon}</span> {CERTAINTY[c].label}
            </label>
          ))}
        </div>
      </fieldset>
      {raising && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-amber-500">
            Raising certainty needs your own statement. What did you confirm, and how?
          </span>
          <textarea
            rows={2}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            className="rounded-lg border border-line bg-bg p-2 text-base"
          />
        </label>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ review_state: "operator_rejected" })}
          className="min-h-touch rounded-lg px-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40"
        >
          Remove: AI got it wrong
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-touch rounded-lg border border-line px-4 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={save}
            className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
