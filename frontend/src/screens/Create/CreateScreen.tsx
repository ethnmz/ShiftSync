import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FIXTURE_MODE,
  SubmitBlockedError,
  answerQuestion,
  confirmRoutine,
  createHandoff,
  getHandoff,
  patchFact,
  postStatement,
  submitHandoff,
  type AnswerInput,
  type StatementInput,
} from "../../api/client";
import type { FactPatch, HandoffDetail } from "../../api/types";
import { formatClock, formatElapsed } from "../../labels";
import { isEditable, submitDisabledReason } from "../../review";
import { useUser } from "../../session/user";
import CaptureSection from "./CaptureSection";
import ClarifySection from "./ClarifySection";
import ReviewModal from "./ReviewModal";
import StructuredSection from "./StructuredSection";

// The demo pairing (demo/scenario.json step 1). docs/UI.md does not say how the
// incoming lead is picked on this screen yet.
const DEMO_INCOMING_ID = "jordan";

// Wall-clock time on this screen, from the first note to submit. It is a
// client-side timer for the operator, not the backend's shift_a_seconds metric
// (the simulated clock is not on the handoff payload: CONTRACT_MIGRATION.md #4).
function useElapsed(startedAt: number | null, stoppedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, stoppedAt]);
  if (startedAt === null) return null;
  return Math.max(0, Math.floor(((stoppedAt ?? now) - startedAt) / 1000));
}

// Shift A, Create Handoff (docs/UI.md Screen 1). Columns stack below lg (tablet)
// and sit side by side on desktop.
export default function CreateScreen() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [blockers, setBlockers] = useState<unknown[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const elapsed = useElapsed(startedAt, stoppedAt);

  const { data: handoff = null } = useQuery({
    queryKey: ["handoff", handoffId],
    queryFn: () => getHandoff(handoffId!),
    enabled: handoffId !== null,
    refetchInterval: 1500,
  });

  function store(detail: HandoffDetail) {
    queryClient.setQueryData(["handoff", detail.id], detail);
    setHandoffId(detail.id);
  }
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["handoff", handoffId] });

  const send = useMutation({
    mutationFn: async (input: StatementInput) => {
      setStartedAt((t) => t ?? Date.now());
      const id = handoffId ?? (await createHandoff(user, DEMO_INCOMING_ID)).id;
      return postStatement(id, input);
    },
    onSuccess: store,
  });

  const answer = useMutation({
    mutationFn: ({ questionId, input }: { questionId: string; input: AnswerInput }) =>
      answerQuestion(handoffId!, questionId, input),
    onSuccess: store,
  });

  const patch = useMutation({
    mutationFn: ({ factId, patch }: { factId: string; patch: FactPatch }) => patchFact(factId, patch),
    onSuccess: () => {
      setBlockers(null);
      return refetch();
    },
  });

  const routine = useMutation({
    mutationFn: () => confirmRoutine(handoffId!),
    onSuccess: () => {
      setBlockers(null);
      return refetch();
    },
  });

  const submit = useMutation({
    mutationFn: () => submitHandoff(handoffId!),
    onMutate: () => setBlockers(null),
    onSuccess: () => {
      setStoppedAt(Date.now());
      setReviewOpen(false);
      return refetch();
    },
    onError: (e) => {
      if (e instanceof SubmitBlockedError) setBlockers(e.blockers);
    },
  });

  function startOver() {
    setHandoffId(null);
    setStartedAt(null);
    setStoppedAt(null);
    setBlockers(null);
    send.reset();
    answer.reset();
    submit.reset();
  }

  const locked = handoff !== null && !isEditable(handoff.state);
  const busyFactId = patch.isPending ? patch.variables.factId : null;
  const reason = submitDisabledReason(handoff);
  const submitError =
    submit.isError && !(submit.error instanceof SubmitBlockedError) ? "Could not submit. Try again." : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-3 lg:p-6">
        <CaptureSection
          handoff={handoff}
          pending={send.isPending}
          locked={locked}
          error={send.isError ? "Could not send the note. Try again, or type it instead." : null}
          onSubmit={(input) => send.mutate(input)}
        />

        <ClarifySection
          handoff={handoff}
          pending={answer.isPending}
          error={answer.isError ? "Could not send the answer. Try again." : null}
          onAnswer={(questionId, input) => answer.mutate({ questionId, input })}
        />

        <StructuredSection
          handoff={handoff}
          busyFactId={busyFactId}
          error={patch.isError ? "Could not save that change. Try again." : null}
          onPatch={(factId, p) => patch.mutate({ factId, patch: p })}
        />
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line bg-panel px-4 py-3 lg:px-6">
        {FIXTURE_MODE && (
          <span className="mr-auto rounded bg-line px-2 py-0.5 text-xs text-muted" title="No backend: replays demo/scenario.json">
            Demo data
          </span>
        )}
        {elapsed !== null && (
          <span className="text-sm tabular-nums text-muted" aria-label="Time on this handoff">
            ⏱ {formatElapsed(elapsed)}
          </span>
        )}
        {locked && handoff ? (
          <>
            <span className="text-sm">
              <span className="font-semibold text-green-500">Submitted {formatClock(handoff.status_line.submitted_at)}</span>
              <span className="text-muted">
                {" "}· Not yet acknowledged · {handoff.status_line.open_followups} open follow-ups (
                {handoff.status_line.unassigned_followups} to be assigned)
              </span>
            </span>
            <Link
              to={`/receive/${handoff.id}`}
              className="flex min-h-touch items-center rounded-xl border border-line px-4 text-sm font-semibold"
            >
              Open as {handoff.incoming.name.split(" ")[0]}
            </Link>
            <button type="button" onClick={startOver} className="min-h-touch rounded-xl bg-accent px-5 font-semibold text-white">
              New handoff
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted">{reason ?? "Ready to submit."}</span>
            <button
              type="button"
              disabled={!handoff || handoff.items.length === 0}
              onClick={() => setReviewOpen(true)}
              className="min-h-touch rounded-xl bg-accent px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Review &amp; submit
            </button>
          </>
        )}
      </footer>

      {reviewOpen && handoff && !locked && (
        <ReviewModal
          handoff={handoff}
          busyFactId={busyFactId}
          confirmingRoutine={routine.isPending}
          submitting={submit.isPending}
          blockers={blockers}
          error={submitError ?? (routine.isError ? "Could not confirm routine items. Try again." : null)}
          onPatch={(factId, p) => patch.mutate({ factId, patch: p })}
          onConfirmRoutine={() => routine.mutate()}
          onSubmit={() => submit.mutate()}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}
