import { useEffect, useRef } from "react";
import type { FactPatch, HandoffDetail } from "../../api/types";
import FactRow from "../../components/FactRow";
import { byPriority, criticalUnreviewed, routineUnreviewed, submitDisabledReason } from "../../review";

function blockerText(b: unknown): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const o = b as Record<string, unknown>;
    for (const k of ["message", "reason", "text", "detail"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return JSON.stringify(b);
}

// docs/UI.md Screen 1 "Review & submit": critical facts need an individual ✓,
// one button for routine items, Submit disabled with a reason. Laid out as a
// centered review modal: one row per AI item with its own check and edit, the
// source quote shown inline, and a single primary action at the bottom.
export default function ReviewModal({
  handoff,
  busyFactId,
  confirmingRoutine,
  submitting,
  blockers,
  error,
  onPatch,
  onConfirmRoutine,
  onSubmit,
  onClose,
}: {
  handoff: HandoffDetail;
  busyFactId: string | null;
  confirmingRoutine: boolean;
  submitting: boolean;
  blockers: unknown[] | null;
  error: string | null;
  onPatch: (factId: string, patch: FactPatch) => void;
  onConfirmRoutine: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const critical = byPriority(handoff.items).filter((i) => i.priority === "critical");
  const criticalTotal = critical.reduce((n, i) => n + i.facts.length, 0);
  const criticalLeft = criticalUnreviewed(handoff).length;
  const criticalDone = criticalTotal - criticalLeft;
  const routine = routineUnreviewed(handoff);
  const otherItems = byPriority(handoff.items).filter((i) => i.priority !== "critical");
  const openQuestions = handoff.questions.filter((q) => q.status === "pending");
  const reason = submitDisabledReason(handoff);

  return (
    <div
      className="fixed inset-0 z-20 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-panel shadow-2xl sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="review-title" className="text-xl font-semibold">
              Review handoff to {handoff.incoming.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              ✓ means the AI wrote down what you said. Certainty does not change, and unknowns stay unknown.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close review"
            className="min-h-touch min-w-touch shrink-0 rounded-lg border border-line"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <section aria-labelledby="critical-title" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="critical-title" className="font-semibold">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                Critical: check each one
              </h3>
              <span className="text-sm tabular-nums text-muted">
                {criticalDone} of {criticalTotal} checked
              </span>
            </div>
            {critical.length === 0 && <p className="text-sm text-muted">No critical items.</p>}
            {critical.map((item) => (
              <div key={item.id} className="rounded-xl border border-line bg-bg">
                <p className="flex items-baseline gap-2 border-b border-line px-4 py-2 font-semibold">
                  {item.title}
                  {item.asset_ids.map((a) => (
                    <span key={a} className="rounded bg-line px-1.5 font-mono text-xs font-normal">
                      {a}
                    </span>
                  ))}
                </p>
                <ul className="px-4">
                  {item.facts.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      itemTitle={item.title}
                      editable
                      showQuote
                      busy={busyFactId === f.id}
                      onPatch={(p) => onPatch(f.id, p)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {otherItems.length > 0 && (
            <section aria-labelledby="routine-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="routine-title" className="font-semibold">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
                  Important and routine
                </h3>
                <button
                  type="button"
                  disabled={routine.length === 0 || confirmingRoutine}
                  onClick={onConfirmRoutine}
                  className="min-h-touch rounded-lg border-2 border-line px-4 text-sm font-semibold hover:border-muted disabled:opacity-40"
                >
                  {confirmingRoutine
                    ? "Confirming…"
                    : routine.length
                      ? `Confirm routine items (${routine.length})`
                      : "✓ All checked"}
                </button>
              </div>
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-bg">
                {otherItems.map((item) => (
                  <li key={item.id} className="flex flex-col gap-0.5 px-4 py-2 text-sm">
                    <span className="font-medium">{item.title}</span>
                    {item.facts.map((f) => (
                      <span key={f.id} className="text-muted">
                        {f.value}
                        {f.review_state !== "ai_extracted" && <span className="ml-2 text-green-500">✓</span>}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">To change one of these, use ✎ on its card.</p>
            </section>
          )}

          {openQuestions.length > 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
              {openQuestions.length} question still open. Safety questions must be answered first ("I don't know" counts).
            </p>
          )}

          {blockers && blockers.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
              <p className="mb-1 font-semibold text-red-400">ShiftSync could not submit yet:</p>
              <ul className="list-disc pl-5">
                {blockers.map((b, i) => (
                  <li key={i}>{blockerText(b)}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-amber-500">⚠ {error}</p>}
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onClose}
            className="min-h-touch rounded-lg border border-line px-4 text-sm font-semibold sm:order-first"
          >
            Keep editing
          </button>
          <div className="flex flex-1 flex-col gap-1 sm:px-4" aria-hidden>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${criticalTotal ? (criticalDone / criticalTotal) * 100 : 100}%` }}
              />
            </div>
            <span className="text-xs text-muted">{reason ?? "Ready to submit."}</span>
          </div>
          <button
            type="button"
            disabled={reason !== null || submitting}
            onClick={onSubmit}
            className="min-h-touch rounded-xl bg-accent px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit handoff"}
          </button>
        </footer>
      </section>
    </div>
  );
}
