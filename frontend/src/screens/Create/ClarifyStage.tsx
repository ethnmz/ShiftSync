import type { AnswerInput } from "../../api/client";
import type { HandoffDetail, Question } from "../../api/types";
import QuestionCard from "../../components/QuestionCard";
import { Button, Card, Notice } from "../../components/ui";
import { slotLabel } from "../../labels";

// What an answered question added: the facts sourced from its answer.
export function effectOf(handoff: HandoffDetail, q: Question) {
  if (q.status === "answered_unknown") return { tone: "unk" as const, text: "Recorded as unknown. A follow-up keeps it visible." };
  const answerIds = new Set(handoff.statements.filter((s) => s.question_id === q.id).map((s) => s.id));
  const slots = handoff.items.flatMap((i) => i.facts).filter((f) => answerIds.has(f.source_statement_id)).map((f) => slotLabel(f.slot));
  return { tone: "ok" as const, text: slots.length ? `Added: ${[...new Set(slots)].join(", ")}` : "Answer recorded." };
}

// Clarify (docs/UI.md Screen 1, step 2): one question at a time, at most the
// backend's budget, with what the last answer added shown right below.
export default function ClarifyStage({
  handoff,
  sending,
  error,
  onAnswer,
  onContinue,
}: {
  handoff: HandoffDetail;
  sending: boolean;
  error: string | null;
  onAnswer: (questionId: string, input: AnswerInput) => void;
  onContinue: () => void;
}) {
  const { max } = handoff.budget;
  const answered = handoff.questions.filter((q) => q.status === "answered" || q.status === "answered_unknown");
  const current = handoff.questions.find((q) => q.status === "pending");
  const last = answered[answered.length - 1];
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title ?? id;
  const lastEffect = last ? effectOf(handoff, last) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        {/* Progress across the budget (docs/API.md budget.max). */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={answered.length} aria-label="Questions answered">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(answered.length / Math.max(max, 1)) * 100}%` }} />
          </div>
          <span className="text-sm tabular-nums text-muted">
            {answered.length} of up to {max} answered
          </span>
        </div>

        {current ? (
          <QuestionCard
            key={current.id}
            eyebrow={`Question ${answered.length + 1} · ${titleOf(current.item_id)}`}
            question={current.text}
            why={current.why_asked}
            sending={sending}
            sendingLabel="Saving your answer…"
            submitLabel="Send answer"
            onText={(text) => onAnswer(current.id, { text })}
            onAudio={(audio) => onAnswer(current.id, { audio })}
            secondary={
              <Button onClick={() => onAnswer(current.id, { dontKnow: true })} disabled={sending} aria-label="I don't know. Records this as unknown." title="Records this as unknown. Nobody has to guess.">
                ? I don't know
              </Button>
            }
            feedback={
              lastEffect && (
                <p className={`text-sm ${lastEffect.tone === "ok" ? "text-ok" : "text-unk"}`}>
                  {lastEffect.tone === "ok" ? "✓" : "?"} Last answer: {lastEffect.text}
                </p>
              )
            }
          />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <h2 className="text-xl font-semibold">{handoff.questions.length ? "No more questions" : "No questions needed"}</h2>
            <p className="text-sm text-muted">
              {handoff.questions.length
                ? "ShiftSync asked what mattered most. Check the structured handoff next."
                : "ShiftSync found nothing important missing in this note."}
            </p>
            {lastEffect && <p className={`text-sm ${lastEffect.tone === "ok" ? "text-ok" : "text-unk"}`}>Last answer: {lastEffect.text}</p>}
            <Button variant="primary" onClick={onContinue}>
              Continue to review →
            </Button>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger" role="alert" title="The answer wasn't saved">
              {error}
            </Notice>
          </div>
        )}
      </Card>

      {answered.length > 0 && (
        <Card>
          <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Answered</h3>
          <ol className="divide-y divide-line">
            {answered.map((q) => {
              const e = effectOf(handoff, q);
              const ans = handoff.statements.find((s) => s.question_id === q.id)?.text;
              return (
                <li key={q.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <span className="text-muted">{q.text}</span>
                  {ans && <span>“{ans}”</span>}
                  <span className={e.tone === "ok" ? "text-ok" : "text-unk"}>
                    {e.tone === "ok" ? "✓" : "?"} {e.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card>
        <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Not asked (low priority)</h3>
        {handoff.not_asked.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Nothing skipped so far.</p>
        ) : (
          <ul className="divide-y divide-line">
            {handoff.not_asked.map((n, i) => (
              <li key={`${n.item_id}-${i}`} className="flex flex-wrap gap-x-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{titleOf(n.item_id)}</span>
                <span className="text-muted">{n.slots.map(slotLabel).join(", ")}</span>
                <span className="text-faint">· {n.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
