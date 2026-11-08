import { useEffect, useRef, type ReactNode } from "react";
import type { AnswerInput } from "../../api/client";
import type { HandoffDetail, Question } from "../../api/types";
import CertaintyBadge from "../../components/CertaintyBadge";
import QuestionCard from "../../components/QuestionCard";
import { Logo } from "../../components/icons";
import { Button, Notice } from "../../components/ui";
import { slotLabel } from "../../labels";
import { byPriority } from "../../review";

// What an answered question added: the facts sourced from its answer.
export function effectOf(handoff: HandoffDetail, q: Question) {
  if (q.status === "answered_unknown") return { tone: "unk" as const, text: "Recorded as unknown. A follow-up keeps it visible." };
  const answerIds = new Set(handoff.statements.filter((s) => s.question_id === q.id).map((s) => s.id));
  const slots = handoff.items.flatMap((i) => i.facts).filter((f) => answerIds.has(f.source_statement_id)).map((f) => slotLabel(f.slot));
  return { tone: "ok" as const, text: slots.length ? `Added: ${[...new Set(slots)].join(", ")}` : "Answer recorded." };
}

export const answeredQuestions = (h: HandoffDetail) => h.questions.filter((q) => q.status === "answered" || q.status === "answered_unknown");

// Facts behind the question being asked now, underlined in the transcript.
export function focusFor(h: HandoffDetail) {
  const current = h.questions.find((q) => q.status === "pending");
  const item = current ? h.items.find((i) => i.id === current.item_id) : null;
  return new Set(item?.facts.map((f) => f.id) ?? []);
}

function AskBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0">
        <Logo size={28} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Asked questions and the operator's answers, as a short conversation.
export function QAHistory({ handoff }: { handoff: HandoffDetail }) {
  const answered = answeredQuestions(handoff);
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title ?? id;
  if (answered.length === 0) return null;
  return (
    <ol className="flex flex-col gap-5">
      {answered.map((q) => {
        const e = effectOf(handoff, q);
        const ans = handoff.statements.find((s) => s.question_id === q.id)?.text;
        return (
          <li key={q.id} className="flex flex-col gap-3">
            <AskBubble>
              <p className="text-sm text-muted">{titleOf(q.item_id)}</p>
              <p className="font-semibold leading-snug">{q.text}</p>
            </AskBubble>
            <div className="ml-10 flex flex-col items-end gap-1">
              <p className="rounded-2xl rounded-br-md bg-subtle px-4 py-2.5">{q.status === "answered_unknown" ? "I don't know" : (ans ?? "Answered")}</p>
              <p className={`text-sm ${e.tone === "ok" ? "text-ok" : "text-unk"}`}>
                {e.tone === "ok" ? "✓" : "?"} {e.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function NotAskedList({ handoff }: { handoff: HandoffDetail }) {
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title ?? id;
  if (handoff.not_asked.length === 0) return <p className="text-muted">Nothing skipped so far.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {handoff.not_asked.map((n, i) => (
        <li key={`${n.item_id}-${i}`} className="flex flex-col gap-0.5 py-3 first:pt-0">
          <span className="font-semibold">{titleOf(n.item_id)}</span>
          <span className="text-sm text-muted">{n.slots.map(slotLabel).join(", ")}</span>
          <span className="text-sm text-faint">{n.reason}</span>
        </li>
      ))}
    </ul>
  );
}

// Read-only structured handoff for the Clarify page's Summary tab.
export function ItemSummary({ handoff, onSelectFact }: { handoff: HandoffDetail; onSelectFact: (id: string) => void }) {
  const items = byPriority(handoff.items);
  if (items.length === 0) return <p className="text-muted">Nothing extracted yet.</p>;
  return (
    <div className="flex flex-col gap-8">
      {items.map((item) => (
        <section key={item.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-xl font-semibold">{item.title}</h3>
            <span className="text-sm text-muted">
              {item.priority[0].toUpperCase() + item.priority.slice(1)}
              {item.asset_ids.length > 0 && ` · ${item.asset_ids.join(", ")}`}
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {item.facts.map((f) => (
              <li key={f.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{slotLabel(f.slot)}</span>
                  <CertaintyBadge certainty={f.certainty} />
                </div>
                <p>{f.value}</p>
                <button type="button" onClick={() => onSelectFact(f.id)} className="self-start text-left text-sm italic text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
                  ❝ {f.quote}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Clarify's right panel: the question conversation, one question at a time,
// at most the backend's budget (docs/UI.md Screen 1, step 2).
export function ClarifyPanel({
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
  const answered = answeredQuestions(handoff);
  const current = handoff.questions.find((q) => q.status === "pending");
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title ?? id;
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the panel, not the page, to the newest question.
    const box = endRef.current?.closest("[data-panel-scroll]");
    box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [answered.length]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={answered.length} aria-label="Questions answered">
          <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${(answered.length / Math.max(max, 1)) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted">
          {answered.length} of up to {max}
        </span>
      </div>

      <QAHistory handoff={handoff} />

      {current ? (
        <AskBubble>
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
          />
        </AskBubble>
      ) : (
        <AskBubble>
          <div className="flex flex-col items-start gap-3">
            <p className="font-semibold">{handoff.questions.length ? "No more questions." : "No questions needed."}</p>
            <p className="text-sm text-muted">
              {handoff.questions.length ? "I asked what mattered most. Check the structured handoff next." : "Nothing important is missing in this note."}
            </p>
            <Button variant="primary" onClick={onContinue}>
              Continue to review →
            </Button>
          </div>
        </AskBubble>
      )}
      {error && (
        <Notice tone="danger" role="alert" title="The answer wasn't saved">
          {error}
        </Notice>
      )}
      <div ref={endRef} />
    </div>
  );
}
