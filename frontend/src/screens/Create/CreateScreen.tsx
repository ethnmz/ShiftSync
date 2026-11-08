import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  SubmitBlockedError,
  answerQuestion,
  confirmRoutine,
  createHandoff,
  errorMessage,
  getHandoff,
  patchFact,
  postStatement,
  submitHandoff,
  type AnswerInput,
  type StatementInput,
} from "../../api/client";
import type { Blocker, FactPatch, HandoffDetail } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import SourcePanel from "../../components/SourcePanel";
import StatusLine from "../../components/StatusLine";
import { Button, Card, Chip, Notice } from "../../components/ui";
import { formatElapsed } from "../../labels";
import { isEditable } from "../../review";
import { useUser } from "../../session/user";
import CaptureStage from "./CaptureStage";
import ClarifyStage from "./ClarifyStage";
import ReviewStage from "./ReviewStage";

// The demo pairing (demo/scenario.json step 1). docs/UI.md does not say how the
// incoming lead is picked on this screen yet.
const DEMO_INCOMING_ID = "jordan";

type Stage = "capture" | "clarify" | "review";
const STAGES: { id: Stage; label: string }[] = [
  { id: "capture", label: "Capture" },
  { id: "clarify", label: "Clarify" },
  { id: "review", label: "Review" },
];

function suggestedStage(h: HandoffDetail | null): Stage {
  if (!h || !h.statements.some((s) => s.role === "handoff")) return "capture";
  if (h.questions.some((q) => q.status === "pending")) return "clarify";
  return "review";
}

// Client-side time on this screen, first note to submit. Not the backend's
// shift_a_seconds metric (the demo clock is not on the payload).
function useElapsed(startedAt: number | null, stoppedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, stoppedAt]);
  return startedAt === null ? null : Math.max(0, Math.floor(((stoppedAt ?? now) - startedAt) / 1000));
}

export default function CreateScreen() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("capture");
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<(Blocker | string)[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const lastInput = useRef<StatementInput | null>(null); // memory only, for "Try again"
  const elapsed = useElapsed(startedAt, stoppedAt);

  const { data: handoff = null, isError: loadFailed, refetch: reload } = useQuery({
    queryKey: ["handoff", handoffId],
    queryFn: () => getHandoff(handoffId!),
    enabled: handoffId !== null,
    refetchInterval: 1500, // docs/UI.md: poll the active handoff
  });

  // Follow the backend: move forward when the handoff's state calls for it.
  const suggested = suggestedStage(handoff);
  useEffect(() => setStage(suggested), [suggested]);

  const store = (d: HandoffDetail) => {
    qc.setQueryData(["handoff", d.id], d);
    setHandoffId(d.id);
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["handoff", handoffId] });

  const send = useMutation({
    mutationFn: async (input: StatementInput) => {
      lastInput.current = input;
      setStartedAt((t) => t ?? Date.now());
      const id = handoffId ?? (await createHandoff(user.id, DEMO_INCOMING_ID)).id;
      setHandoffId(id);
      return postStatement(id, input);
    },
    onSuccess: (d) => {
      lastInput.current = null;
      store(d);
    },
  });
  const answer = useMutation({
    mutationFn: ({ qid, input }: { qid: string; input: AnswerInput }) => answerQuestion(handoffId!, qid, input),
    onSuccess: store,
  });
  const patch = useMutation({
    mutationFn: ({ factId, p }: { factId: string; p: FactPatch }) => patchFact(factId, p),
    onSuccess: () => {
      setBlockers(null);
      return refresh();
    },
  });
  const routine = useMutation({ mutationFn: () => confirmRoutine(handoffId!), onSuccess: refresh });
  const submit = useMutation({
    mutationFn: () => submitHandoff(handoffId!),
    onMutate: () => setBlockers(null),
    onSuccess: () => {
      setStoppedAt(Date.now());
      return refresh();
    },
    onError: (e) => e instanceof SubmitBlockedError && setBlockers(e.blockers),
  });

  function startOver() {
    setHandoffId(null);
    setStartedAt(null);
    setStoppedAt(null);
    setBlockers(null);
    setSelectedFactId(null);
    for (const m of [send, answer, patch, routine, submit]) m.reset();
  }

  const editable = handoff ? isEditable(handoff.state) : true;
  const submitted = handoff !== null && !editable;
  const facts = handoff?.items.flatMap((i) => i.facts) ?? [];
  const selectedFact = facts.find((f) => f.id === selectedFactId) ?? null;
  const reachable: Record<Stage, boolean> = {
    capture: editable,
    clarify: !!handoff && handoff.statements.length > 0,
    review: !!handoff && handoff.items.length > 0,
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="New handoff"
        meta={
          <>
            <span>
              {user.name} → {handoff?.incoming.name ?? "Jordan Blake"}
            </span>
            {handoff && <Chip tone="neutral">{handoff.id}</Chip>}
            {handoff && <Chip tone={submitted ? "ok" : "accent"}>{handoff.state.replace(/_/g, " ")}</Chip>}
            {elapsed !== null && (
              <span className="tabular-nums" aria-label="Time on this handoff">
                ◷ {formatElapsed(elapsed)}
              </span>
            )}
          </>
        }
        actions={
          handoff && (
            <Button size="sm" variant="ghost" onClick={startOver}>
              Start a new handoff
            </Button>
          )
        }
      />

      {/* Stepper */}
      <nav aria-label="Handoff steps" className="border-b border-line bg-surface px-4 lg:px-8">
        <ol className="flex gap-1 overflow-x-auto">
          {STAGES.map((s, i) => {
            const active = stage === s.id && !submitted;
            const done = submitted || STAGES.findIndex((x) => x.id === suggested) > i;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!reachable[s.id] || submitted}
                  onClick={() => setStage(s.id)}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-h-touch items-center gap-2 border-b-2 px-3 text-sm font-medium disabled:cursor-not-allowed ${
                    active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink disabled:text-faint"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      done ? "bg-ok/15 text-ok" : active ? "bg-accent text-accent-ink" : "bg-subtle text-muted"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {s.label}
                  <span className="sr-only">{done ? "(done)" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:px-8">
        <div className="min-w-0">
          {loadFailed && (
            <div className="mb-4">
              <Notice tone="danger" role="alert" title="Lost contact with the handoff" action={<Button size="sm" onClick={() => reload()}>Retry</Button>}>
                The last refresh failed. Your work is saved on the server; nothing here was changed.
              </Notice>
            </div>
          )}

          {submitted && handoff ? (
            <Card className="flex flex-col gap-4 p-5">
              <Notice tone="ok" role="status" title={`Submitted to ${handoff.incoming.name}`}>
                The incoming lead now sees the briefing. Submitting does not close open issues or confirm anything is safe.
              </Notice>
              <StatusLine handoff={handoff} />
              <div className="flex flex-wrap gap-2">
                <Link to={`/receive/${handoff.id}`} className="inline-flex min-h-touch items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
                  Open the incoming view →
                </Link>
                <Button onClick={startOver}>Start a new handoff</Button>
              </div>
            </Card>
          ) : null}

          {!submitted && stage === "capture" && (
            <CaptureStage
              handoff={handoff}
              sending={send.isPending}
              sendingKind={send.isPending ? ("audio" in (send.variables ?? {}) ? "audio" : "text") : null}
              error={send.isError ? errorMessage(send.error, "Couldn't send the note. Try again, or type it instead.") : null}
              canRetry={send.isError && lastInput.current !== null}
              onRetry={() => lastInput.current && send.mutate(lastInput.current)}
              onSend={(input) => send.mutate(input)}
              onContinue={() => setStage(suggestedStage(handoff) === "capture" ? "clarify" : suggestedStage(handoff))}
            />
          )}

          {!submitted && stage === "clarify" && handoff && (
            <ClarifyStage
              handoff={handoff}
              sending={answer.isPending}
              error={answer.isError ? errorMessage(answer.error, "Couldn't save the answer. Try again.") : null}
              onAnswer={(qid, input) => answer.mutate({ qid, input })}
              onContinue={() => setStage("review")}
            />
          )}

          {(stage === "review" || submitted) && handoff && (
            <div className={submitted ? "mt-6" : ""}>
              <ReviewStage
                handoff={handoff}
                editable={editable}
                busyFactId={patch.isPending ? patch.variables.factId : null}
                selectedFactId={selectedFactId}
                confirmingRoutine={routine.isPending}
                submitting={submit.isPending}
                blockers={blockers}
                error={
                  submit.isError && !(submit.error instanceof SubmitBlockedError)
                    ? errorMessage(submit.error, "Couldn't submit. Nothing was sent; try again.")
                    : patch.isError
                      ? errorMessage(patch.error, "Couldn't save that change.")
                      : routine.isError
                        ? errorMessage(routine.error, "Couldn't confirm routine items.")
                        : null
                }
                onSelectFact={setSelectedFactId}
                onPatch={(factId, p) => patch.mutate({ factId, p })}
                onConfirmRoutine={() => routine.mutate()}
                onSubmit={() => !submit.isPending && submit.mutate()}
              />
            </div>
          )}
        </div>

        <aside aria-label="Evidence" className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <SourcePanel
            statements={handoff?.statements ?? []}
            facts={facts}
            questions={handoff?.questions}
            selectedFact={selectedFact}
            empty={
              <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
                What you say appears here after it's sent. Words that lower certainty are underlined.
              </p>
            }
          />
        </aside>
      </div>
    </div>
  );
}
