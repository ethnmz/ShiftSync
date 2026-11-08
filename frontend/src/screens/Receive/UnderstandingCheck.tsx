import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { answerVerification, clarifiedInPerson, errorMessage, startVerification, type StatementInput } from "../../api/client";
import type { HandoffDetail, Verdict, VerificationAttempt, VerificationCheck } from "../../api/types";
import { canAssign } from "../../session/user";
import CertaintyBadge from "../../components/CertaintyBadge";
import QuestionCard from "../../components/QuestionCard";
import { Button, Card, Chip, Notice, type Tone } from "../../components/ui";
import { formatClock } from "../../labels";
import { useUser } from "../../session/user";

const ATTEMPT_LIMIT = 2; // config/slots.yaml budgets.verification_attempts

// A Check's stored history as attempt results. Only the last attempt carries
// the check's current status; earlier ones were retried.
function toAttempts(c: VerificationCheck): VerificationAttempt[] {
  return c.attempts.map((a, i) => ({
    ...a,
    check_id: c.id,
    attempt: i + 1,
    status: i === c.attempts.length - 1 ? c.status : "pending",
    next_check: null,
  }));
}

const VERDICT: Record<Verdict, { tone: Tone; icon: string; label: string }> = {
  consistent: { tone: "ok", icon: "✓", label: "Consistent with the handoff" },
  partially_consistent: { tone: "warn", icon: "◐", label: "Partially consistent" },
  inconsistent: { tone: "danger", icon: "✕", label: "Inconsistent with the handoff" },
};

// Highlights the phrases the grader flagged as contradicting the handoff.
function markClaims(text: string, claims: string[]): ReactNode {
  const c = claims.find((x) => x && text.toLowerCase().includes(x.toLowerCase()));
  if (!c) return text;
  const at = text.toLowerCase().indexOf(c.toLowerCase());
  return (
    <>
      {text.slice(0, at)}
      <mark className="!bg-danger/20">{text.slice(at, at + c.length)}</mark>
      {text.slice(at + c.length)}
    </>
  );
}

function Result({ attempt, answer, handoff }: { attempt: VerificationAttempt; answer: string; handoff: HandoffDetail }) {
  const v = VERDICT[attempt.verdict];
  const facts = handoff.items.flatMap((i) => i.facts);
  const relevant = [...new Set([...attempt.contradictions.map((c) => c.fact_id), ...attempt.missing_fact_ids])]
    .map((id) => facts.find((f) => f.id === id))
    .filter((f) => !!f);
  const said = attempt.answer_text ?? answer;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={v.tone} icon={v.icon}>
          {v.label}
        </Chip>
        <span className="text-xs text-muted">
          Attempt {attempt.attempt} of {ATTEMPT_LIMIT}
        </span>
      </div>
      <p className="text-sm">{attempt.feedback}</p>

      {attempt.verdict !== "consistent" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">What you said</h4>
            <p className="rounded-md border border-line bg-surface p-2 text-sm">“{markClaims(said, attempt.contradictions.map((c) => c.claimed))}”</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">What the handoff says</h4>
            <ul className="flex flex-col gap-1.5">
              {relevant.map((f) => (
                <li key={f!.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-2 text-sm">
                  <CertaintyBadge certainty={f!.certainty} />
                  {f!.value}
                </li>
              ))}
              {relevant.length === 0 && <li className="text-sm text-muted">No specific facts were listed.</li>}
            </ul>
          </div>
        </div>
      )}

      {attempt.evidence.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Evidence from {handoff.outgoing.name}</h4>
          <ul className="flex flex-col gap-1.5">
            {attempt.evidence.map((e, i) => {
              const s = handoff.statements.find((x) => x.id === e.statement_id);
              return (
                <li key={i} className="border-l-2 border-warn pl-3 text-sm">
                  <span className="italic">“{e.quote}”</span>
                  {s && <span className="ml-2 text-xs text-faint">{formatClock(s.at)}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Understanding verification (docs/UI.md Screen 2). One open question at a
// time; the verdict, feedback and evidence are what the API returns.
export default function UnderstandingCheck({ handoff, onChanged }: { handoff: HandoffDetail; onChanged: () => void }) {
  const { user } = useUser();
  const [check, setCheck] = useState<VerificationCheck | null>(null);
  const [attempts, setAttempts] = useState<VerificationAttempt[]>([]);
  const [lastAnswer, setLastAnswer] = useState("");
  const [localClosed, setLocalClosed] = useState(0);
  const [note, setNote] = useState("");

  function show(c: VerificationCheck | null) {
    setCheck(c);
    setAttempts(c ? toAttempts(c) : []);
    answer.reset();
  }

  // Resume after a reload: HandoffDetail.checks holds each check's attempt
  // history (ethnmz/hackutd2026#10), so pick up the open one.
  const serverOpen = handoff.checks?.find((c) => c.status === "pending" || c.status === "needs_clarification") ?? null;
  useEffect(() => {
    if (!check && serverOpen && handoff.state === "verifying") show(serverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOpen?.id, handoff.state]);

  const start = useMutation({
    mutationFn: () => startVerification(handoff.id),
    onSuccess: (r) => {
      show(r.check);
      onChanged();
    },
  });
  const answer = useMutation({
    mutationFn: (input: StatementInput) => answerVerification(check!.id, input),
    onMutate: (input) => setLastAnswer("text" in input ? input.text : "(voice answer)"),
    onSuccess: (a) => {
      setAttempts((xs) => [...xs, a]);
      onChanged();
    },
  });
  const clarify = useMutation({
    mutationFn: () => clarifiedInPerson(check!.id, note.trim()),
    onSuccess: () => {
      setNote("");
      setLocalClosed((n) => n + 1);
      // The response is HandoffDetail; the next open check comes from the
      // refreshed handoff.checks via the resume effect above.
      setCheck(null);
      setAttempts([]);
      onChanged();
    },
  });

  function next(c: VerificationCheck | null) {
    setLocalClosed((n) => n + 1);
    show(c);
  }

  // Position of the current check: from the server's list when it sends one.
  const serverIndex = handoff.checks?.findIndex((c) => c.id === check?.id) ?? -1;
  const checkNumber = serverIndex >= 0 ? serverIndex + 1 : localClosed + 1;

  const last = attempts[attempts.length - 1];
  const status = last?.status ?? check?.status ?? "pending";
  const done = handoff.state === "verified" || handoff.state === "verified_with_assistance";
  const itemTitle = check ? handoff.items.find((i) => i.id === check.item_id)?.title : undefined;

  let body: ReactNode;
  if (done) {
    body = (
      <div className="flex flex-col gap-3">
      {last && <Result attempt={last} answer={lastAnswer} handoff={handoff} />}
      <Notice tone="ok" title={handoff.state === "verified_with_assistance" ? "Understanding verified with assistance" : "Understanding verified"}>
        {handoff.state === "verified_with_assistance"
          ? "At least one check was clarified in person by a lead. "
          : `${handoff.incoming.name} answered the critical checks consistently with the handoff. `}
        This doesn't close follow-ups or confirm any equipment is safe.
      </Notice>
      </div>
    );
  } else if (handoff.state === "submitted") {
    body = <p className="text-sm text-muted">Acknowledge receipt first. Then answer a few questions about the critical items in your own words.</p>;
  } else if (!check) {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted">
          A few open questions about the critical items. Answer in your own words. ShiftSync compares your answer with what {handoff.outgoing.name} said
          and shows the evidence.
        </p>
        <Button variant="primary" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? "Starting…" : handoff.state === "verifying" ? "Resume understanding check" : "Start understanding check"}
        </Button>
        {start.isError && (
          <Notice tone="danger" role="alert">
            {errorMessage(start.error, "Couldn't start the check. Try again.")}
          </Notice>
        )}
      </div>
    );
  } else {
    const canRetry = status === "pending";
    const attemptNo = attempts.length + 1;
    body = (
      <div className="flex flex-col gap-4">
        <QuestionCard
          key={`${check.id}-${attempts.length}`}
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              Check {checkNumber}
              {itemTitle && <span>· {itemTitle}</span>}
              {canRetry && (
                <Chip tone="neutral">
                  Attempt {attemptNo} of {ATTEMPT_LIMIT}
                </Chip>
              )}
            </span>
          }
          question={check.question}
          sending={answer.isPending}
          sendingLabel="Comparing with the handoff…"
          submitLabel={
            !canRetry
              ? "No attempts left"
              : attempts.length
                ? `Try again (attempt ${attemptNo} of ${ATTEMPT_LIMIT})`
                : "Check my answer"
          }
          placeholder="Explain it the way you'd brief your team…"
          disabled={!canRetry}
          onText={(text) => answer.mutate({ text })}
          onAudio={(audio) => answer.mutate({ audio })}
          feedback={last && <Result attempt={last} answer={lastAnswer} handoff={handoff} />}
        />
        {answer.isError && (
          <Notice tone="danger" role="alert" title="Your answer wasn't checked">
            {errorMessage(answer.error, "The request failed. Nothing was recorded; try again.")}
          </Notice>
        )}

        {(status === "verified" || status === "clarified_in_person") && (
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => next(last?.next_check ?? null)}>
              {last?.next_check ? "Next question →" : "Finish"}
            </Button>
          </div>
        )}

        {status === "needs_clarification" && (
          <Card className="flex flex-col gap-3 p-4">
            <h3 className="font-semibold">Talk to {handoff.outgoing.name}, then mark this clarified in person</h3>
            <p className="text-sm text-muted">
              Two attempts didn't match the handoff. A lead or supervisor clarifies it face to face. This is logged and the handoff is marked "verified with
              assistance".
            </p>
            {canAssign(user) ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim() && !clarify.isPending) clarify.mutate();
                }}
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">What was clarified?</span>
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-line-strong bg-surface p-2" />
                </label>
                {clarify.isError && (
                  <Notice tone="danger" role="alert">
                    {errorMessage(clarify.error, "Couldn't save the clarification.")}
                  </Notice>
                )}
                <div className="flex justify-end">
                  <Button variant="primary" type="submit" disabled={!note.trim() || clarify.isPending}>
                    {clarify.isPending ? "Saving…" : "Mark clarified in person"}
                  </Button>
                </div>
              </form>
            ) : (
              <Notice tone="warn">Only a lead or supervisor can mark a check clarified in person. Switch the demo user.</Notice>
            )}
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Understanding check</h2>
        <span className="text-xs text-muted">Separate from acknowledgment · up to {ATTEMPT_LIMIT} attempts per question</span>
      </div>
      {body}
    </Card>
  );
}
