import type { AnswerInput } from "../../api/client";
import type { HandoffDetail, Question } from "../../api/types";
import Panel from "../../components/Panel";
import QuestionCard from "../../components/QuestionCard";
import { slotLabel } from "../../labels";

// What an answered question added: the facts sourced from its answer statement.
function effectOf(handoff: HandoffDetail, q: Question) {
  if (q.status === "answered_unknown") return "? Recorded as unknown";
  const answerIds = new Set(handoff.statements.filter((s) => s.question_id === q.id).map((s) => s.id));
  const slots = handoff.items
    .flatMap((i) => i.facts)
    .filter((f) => answerIds.has(f.source_statement_id))
    .map((f) => slotLabel(f.slot));
  return slots.length ? `✓ Added: ${[...new Set(slots)].join(", ")}` : "✓ Answered";
}

function answerText(handoff: HandoffDetail, q: Question) {
  return handoff.statements.find((s) => s.question_id === q.id)?.text;
}

export default function ClarifySection({
  handoff,
  pending,
  error,
  onAnswer,
}: {
  handoff: HandoffDetail | null;
  pending: boolean;
  error: string | null;
  onAnswer: (questionId: string, input: AnswerInput) => void;
}) {
  if (!handoff) {
    return (
      <Panel step={2} title="Clarify">
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          Questions appear here after your note, one at a time.
        </p>
      </Panel>
    );
  }

  const { max } = handoff.budget;
  const answered = handoff.questions.filter((q) => q.status === "answered" || q.status === "answered_unknown");
  const current = handoff.questions.find((q) => q.status === "pending");
  const titleOf = (itemId: string) => handoff.items.find((i) => i.id === itemId)?.title ?? itemId;

  return (
    <Panel step={2} title="Clarify">
      <p className="text-sm text-muted">
        {current
          ? `Up to ${max} quick answers. Only what the next shift needs.`
          : `No more questions · ${answered.length} answered`}
      </p>

      {answered.length > 0 && (
        <ol className="flex flex-col gap-2">
          {answered.map((q) => (
            <li key={q.id}>
              <details className="rounded-lg border border-line bg-bg">
                <summary className="flex min-h-touch cursor-pointer flex-col justify-center gap-0.5 px-4 py-2">
                  <span className="line-clamp-1 text-sm text-muted">{q.text}</span>
                  <span
                    className={`text-sm font-medium ${
                      q.status === "answered_unknown" ? "text-violet-400" : "text-green-500"
                    }`}
                  >
                    {effectOf(handoff, q)}
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-3 text-sm">
                  <p className="mb-1 text-muted">{q.text}</p>
                  <p>“{answerText(handoff, q)}”</p>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}

      {current ? (
        <QuestionCard
          key={current.id}
          question={current}
          number={answered.length + 1}
          max={max}
          pending={pending}
          onAnswer={(input) => onAnswer(current.id, input)}
        />
      ) : (
        <p className="rounded-lg border border-line p-4 text-sm text-muted">
          {handoff.questions.length === 0
            ? "No questions needed for this note."
            : "No more questions. Review the structured handoff, then submit."}
        </p>
      )}
      {error && <p className="text-sm text-amber-500">⚠ {error}</p>}

      <div className="mt-auto">
        <h3 className="mb-2 text-sm font-medium text-muted">Not asked (low priority)</h3>
        {handoff.not_asked.length === 0 ? (
          <p className="text-sm text-muted">Nothing skipped yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {handoff.not_asked.map((n, i) => (
              <li key={`${n.item_id}-${i}`}>
                <span className="text-ink/80">{titleOf(n.item_id)}</span>: {n.slots.map(slotLabel).join(", ")}
                <span className="opacity-70"> · {n.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
