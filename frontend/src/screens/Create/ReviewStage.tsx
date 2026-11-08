import type { Blocker, FactPatch, HandoffDetail, Item } from "../../api/types";
import FactRow from "../../components/FactRow";
import FollowUpRow from "../../components/FollowUpRow";
import { Button, Card, Chip, Notice, Spinner } from "../../components/ui";
import { byPriority, criticalUnreviewed, routineUnreviewed, submitDisabledReason } from "../../review";

const PRIORITY = {
  critical: { bar: "bg-danger", chip: "danger" as const, label: "Critical" },
  important: { bar: "bg-warn", chip: "warn" as const, label: "Important" },
  routine: { bar: "bg-line-strong", chip: "neutral" as const, label: "Routine" },
};

function ItemBlock({
  item,
  editable,
  busyFactId,
  selectedFactId,
  onSelect,
  onPatch,
}: {
  item: Item;
  editable: boolean;
  busyFactId: string | null;
  selectedFactId: string | null;
  onSelect: (factId: string) => void;
  onPatch: (factId: string, p: FactPatch) => void;
}) {
  const p = PRIORITY[item.priority];
  return (
    <Card className="relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${p.bar}`} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 pl-5">
        <h3 className="font-semibold">{item.title}</h3>
        {item.asset_ids.map((a) => (
          <span key={a} className="rounded border border-line bg-subtle px-1.5 font-mono text-xs">
            {a}
          </span>
        ))}
        {item.carried_over_from && <Chip tone="neutral" icon="↻">Carried over</Chip>}
        <span className="ml-auto">
          <Chip tone={p.chip}>{p.label}</Chip>
        </span>
      </div>
      <ul className="flex flex-col gap-1 p-1.5 pl-2.5">
        {item.facts.map((f) => (
          <FactRow
            key={f.id}
            fact={f}
            itemTitle={item.title}
            editable={editable}
            busy={busyFactId === f.id}
            selected={selectedFactId === f.id}
            onSelect={() => onSelect(f.id)}
            onPatch={(patch) => onPatch(f.id, patch)}
          />
        ))}
      </ul>
    </Card>
  );
}

// Review (docs/UI.md Screen 1, step 3): editable facts beside their source.
export default function ReviewStage({
  handoff,
  editable,
  busyFactId,
  selectedFactId,
  confirmingRoutine,
  submitting,
  blockers,
  error,
  onSelectFact,
  onPatch,
  onConfirmRoutine,
  onSubmit,
}: {
  handoff: HandoffDetail;
  editable: boolean;
  busyFactId: string | null;
  selectedFactId: string | null;
  confirmingRoutine: boolean;
  submitting: boolean;
  blockers: (Blocker | string)[] | null;
  error: string | null;
  onSelectFact: (id: string) => void;
  onPatch: (factId: string, p: FactPatch) => void;
  onConfirmRoutine: () => void;
  onSubmit: () => void;
}) {
  const items = byPriority(handoff.items);
  const critical = items.filter((i) => i.priority === "critical");
  const others = items.filter((i) => i.priority !== "critical");
  const criticalTotal = critical.reduce((n, i) => n + i.facts.length, 0);
  const criticalLeft = criticalUnreviewed(handoff).length;
  const routine = routineUnreviewed(handoff);
  const reason = submitDisabledReason(handoff);
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title;
  const openQuestions = handoff.questions.filter((q) => q.status === "pending").length;

  const block = (props: { item: Item }) => (
    <ItemBlock
      key={props.item.id}
      item={props.item}
      editable={editable}
      busyFactId={busyFactId}
      selectedFactId={selectedFactId}
      onSelect={onSelectFact}
      onPatch={onPatch}
    />
  );

  return (
    <div className="flex flex-col gap-8 pb-4">
      <p className="text-sm text-muted">
        <strong className="text-ink">✓ Correct</strong> means the AI wrote down what you said. It does not change certainty: an Unknown stays
        Unknown. Select a quote to see it in the transcript.
      </p>

      <section aria-labelledby="crit" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="crit" className="text-xl font-semibold">
            Critical: check each fact
          </h2>
          <span className="text-sm tabular-nums text-muted">
            {criticalTotal - criticalLeft} of {criticalTotal} checked
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${criticalTotal ? ((criticalTotal - criticalLeft) / criticalTotal) * 100 : 100}%` }} />
        </div>
        {critical.length === 0 ? <p className="text-sm text-muted">No critical items.</p> : critical.map((item) => block({ item }))}
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="other" className="text-xl font-semibold">
              Important and routine
            </h2>
            {editable && (
              <Button size="sm" onClick={onConfirmRoutine} disabled={routine.length === 0 || confirmingRoutine}>
                {confirmingRoutine ? "Confirming…" : routine.length ? `✓ Confirm routine items (${routine.length})` : "✓ All checked"}
              </Button>
            )}
          </div>
          {others.map((item) => block({ item }))}
        </section>
      )}

      <section aria-labelledby="fu" className="flex flex-col gap-3">
        <h2 id="fu" className="text-xl font-semibold">
          Follow-ups
        </h2>
        <Card>
          {handoff.followups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">None yet. Follow-ups are created automatically for uncertain or unfinished critical work.</p>
          ) : (
            <ul className="divide-y divide-line">
              {handoff.followups.map((f) => (
                <FollowUpRow key={f.id} followup={f} itemTitle={titleOf(f.item_id)} />
              ))}
            </ul>
          )}
        </Card>
        <p className="text-xs text-faint">Owners and deadlines are set by a lead or supervisor on the incoming side, never guessed.</p>
      </section>

      {editable && (
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface/95 px-5 py-4 backdrop-blur">
          {openQuestions > 0 && (
            <Notice tone="warn">
              {openQuestions} clarification question still open. Safety questions must be answered first ("I don't know" counts).
            </Notice>
          )}
          {blockers && blockers.length > 0 && (
            <Notice tone="danger" role="alert" title="ShiftSync couldn't submit yet">
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b, i) => {
                  const text = typeof b === "string" ? b : b.message;
                  const fid = typeof b === "string" ? undefined : b.fact_id;
                  return (
                    <li key={i}>
                      {fid ? (
                        <button type="button" className="text-left underline underline-offset-2" onClick={() => onSelectFact(fid)}>
                          {text}
                        </button>
                      ) : (
                        text
                      )}
                    </li>
                  );
                })}
              </ul>
            </Notice>
          )}
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted" aria-live="polite">
              {submitting ? <Spinner label="Submitting…" /> : (reason ?? `Ready to send to ${handoff.incoming.name}.`)}
            </span>
            <Button variant="primary" size="lg" onClick={onSubmit} disabled={reason !== null || submitting}>
              Submit handoff
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
