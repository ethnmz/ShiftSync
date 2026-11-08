import { useEffect, useRef, type ReactNode } from "react";
import type { AnswerInput } from "../../api/client";
import type { HandoffDetail, Question } from "../../api/types";
import CertaintyBadge from "../../components/CertaintyBadge";
import QuestionCard from "../../components/QuestionCard";
import { CircleCheck, CircleHelp } from "lucide-react";
import { Button, Notice } from "../../components/ui";
import { formatClock, slotLabel } from "../../labels";
import { person } from "../../session/roster";
import { byPriority } from "../../review";
import { AiByline } from "../../components/mascots/Flat";

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

// Thread pieces in the Harbor inbox style: a sender row over each message,
// and centered system lines for what an answer changed.
function SenderRow({ name, at, avatar, right = false }: { name: string; at?: string; avatar: ReactNode; right?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${right ? "flex-row-reverse" : ""}`}>
      {avatar}
      <span className="font-semibold">{name}</span>
      {at && <span className="text-sm tabular-nums text-muted">{formatClock(at)}</span>}
    </div>
  );
}

function SystemLine({ tone, children }: { tone: "ok" | "unk"; children: ReactNode }) {
  const Icon = tone === "ok" ? CircleCheck : CircleHelp;
  return (
    <p className="flex justify-center">
      <span className="inline-flex max-w-[90%] items-start gap-2 text-sm text-muted">
        <Icon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${tone === "ok" ? "text-ok" : "text-unk"}`} />
        <span>{children}</span>
      </span>
    </p>
  );
}

function AskBubble({ children, item }: { children: ReactNode; item?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <AiByline kind="orbit" />
      {item && <p className="text-sm text-muted">{item}</p>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Asked questions and the operator's answers, as a short thread.
export function QAHistory({ handoff }: { handoff: HandoffDetail }) {
  const answered = answeredQuestions(handoff);
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title ?? id;
  if (answered.length === 0) return null;
  return (
    <ol className="flex flex-col gap-6">
      {answered.map((q) => {
        const e = effectOf(handoff, q);
        const st = handoff.statements.find((x) => x.question_id === q.id);
        const who = person(st?.speaker_id)?.name ?? handoff.outgoing.name;
        return (
          <li key={q.id} className="flex flex-col gap-3">
            <AskBubble item={titleOf(q.item_id)}>
              <p className="font-semibold leading-snug">{q.text}</p>
            </AskBubble>
            <div className="flex flex-col items-end gap-2">
              <SenderRow
                right
                name={who}
                at={st?.at}
                avatar={
                  <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">
                    {who.slice(0, 1)}
                  </span>
                }
              />
              <p className="max-w-[90%] rounded-2xl rounded-tr-md border border-line bg-surface px-4 py-2.5 shadow-card">
                {q.status === "answered_unknown" ? "I don't know" : (st?.text ?? "Answered")}
              </p>
            </div>
            <SystemLine tone={e.tone}>{e.text}</SystemLine>
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
