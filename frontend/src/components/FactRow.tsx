import { useState } from "react";
import type { Certainty, Fact, FactPatch } from "../api/types";
import { slotLabel } from "../labels";
import { isRaise } from "../review";
import CertaintyBadge, { CERTAINTY, ReviewChip } from "./CertaintyBadge";
import { Button, fieldClass } from "./ui";

const LEVELS: Certainty[] = ["confirmed", "reported", "unverified", "unknown"];

// One fact: slot · value · certainty (the world) · review state (the operator)
// · source link · ✓ check · ✎ edit. Certainty and review stay separate.
export default function FactRow({
  fact,
  itemTitle,
  editable,
  busy,
  selected = false,
  onSelect,
  onPatch,
}: {
  fact: Fact;
  itemTitle: string;
  editable: boolean;
  busy: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onPatch?: (patch: FactPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const rejected = fact.review_state === "operator_rejected";
  const label = `${itemTitle} ${slotLabel(fact.slot)}`;

  return (
    <li className={`flex flex-col gap-2 rounded-lg px-3 py-2.5 ${selected ? "bg-warn/5 ring-1 ring-warn/40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted">{slotLabel(fact.slot)}</span>
            <CertaintyBadge certainty={fact.certainty} />
            <ReviewChip state={fact.review_state} />
          </div>
          <p className={`mt-1 font-semibold leading-snug ${rejected ? "text-faint line-through" : ""}`}>{fact.value}</p>
          {fact.review_state === "operator_edited" && fact.ai_proposed_value && (
            <p className="text-xs text-faint">AI had: “{fact.ai_proposed_value}”</p>
          )}
          {onSelect ? (
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="mt-1 max-w-full truncate text-left text-sm italic text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
              aria-label={`Show the source of ${label}: ${fact.quote}`}
              title="Show this quote in the source transcript"
            >
              ❝ {fact.quote}
            </button>
          ) : (
            <p className="mt-1 text-sm italic text-muted">❝ {fact.quote}</p>
          )}
        </div>
        {editable && !editing && onPatch && (
          <div className="flex shrink-0 gap-1.5">
            {fact.review_state === "ai_extracted" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onPatch({ review_state: "operator_confirmed" })}
                aria-label={`Check ${label}: recorded correctly`}
                title="The AI recorded this correctly. Certainty does not change."
                className="border-ok/50 text-ok"
              >
                ✓ Correct
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(true)} aria-label={`Edit ${label}`}>
              ✎
            </Button>
          </div>
        )}
      </div>
      {editing && onPatch && (
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

function FactEditor({ fact, busy, onCancel, onSave }: { fact: Fact; busy: boolean; onCancel: () => void; onSave: (patch: FactPatch) => void }) {
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
    <div
      className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Value</span>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={`${fieldClass} min-h-touch`} />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 font-semibold">Certainty</legend>
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((c) => (
            <label
              key={c}
              className={`flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-md border px-3 focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
                certainty === c ? "border-accent bg-accent/10" : "border-line-strong bg-surface"
              }`}
            >
              <input type="radio" name={`cert-${fact.id}`} aria-label={CERTAINTY[c].label} className="sr-only" checked={certainty === c} onChange={() => setCertainty(c)} />
              <span aria-hidden>{CERTAINTY[c].icon}</span> {CERTAINTY[c].label}
            </label>
          ))}
        </div>
      </fieldset>
      {raising && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-warn">Raising certainty needs your own statement. What did you confirm, and how?</span>
          <textarea rows={2} value={statement} onChange={(e) => setStatement(e.target.value)} className={`${fieldClass} py-2`} />
        </label>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="danger" size="sm" disabled={busy} onClick={() => onSave({ review_state: "operator_rejected" })}>
          Remove: AI got it wrong
        </Button>
        <div className="flex gap-2">
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !canSave} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
