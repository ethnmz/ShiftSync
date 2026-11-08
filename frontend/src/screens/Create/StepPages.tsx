import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SubmitBlockedError, answerQuestion, confirmRoutine, errorMessage, patchFact, submitHandoff, type AnswerInput } from "../../api/client";
import type { Blocker, FactPatch, HandoffDetail } from "../../api/types";
import SourcePanel from "../../components/SourcePanel";
import StatusLine from "../../components/StatusLine";
import { Button, Card, Notice, Skeleton } from "../../components/ui";
import { isEditable } from "../../review";
import { PageWidth, suggestedStep, useFlow, useHandoffQuery } from "./CreateFlow";
import ClarifyStage from "./ClarifyStage";
import ReviewStage from "./ReviewStage";

function useLoaded() {
  const { id } = useParams();
  const q = useHandoffQuery(id);
  return { id: id!, q };
}

function Loading({ q }: { q: ReturnType<typeof useHandoffQuery> }) {
  if (q.isError)
    return (
      <PageWidth>
        <Notice tone="danger" role="alert" title="Couldn't load this handoff" action={<Button size="sm" onClick={() => q.refetch()}>Retry</Button>}>
          {errorMessage(q.error, "The request failed.")}
        </Notice>
      </PageWidth>
    );
  return (
    <PageWidth>
      <Card className="p-5">
        <Skeleton lines={4} />
      </Card>
    </PageWidth>
  );
}

// /create/:id -> whichever step the handoff is on.
export function StepRedirect() {
  const { id, q } = useLoaded();
  if (!q.data) return <Loading q={q} />;
  return <Navigate to={`/create/${id}/${suggestedStep(q.data)}`} replace />;
}

// Step 2 of 3.
export function ClarifyPage() {
  const { id, q } = useLoaded();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const answer = useMutation({
    mutationFn: ({ qid, input }: { qid: string; input: AnswerInput }) => answerQuestion(id, qid, input),
    onSuccess: (d: HandoffDetail) => {
      qc.setQueryData(["handoff", id], d);
      if (!d.questions.some((x) => x.status === "pending")) navigate(`/create/${id}/review`);
    },
  });
  if (!q.data) return <Loading q={q} />;
  if (!isEditable(q.data.state)) return <Navigate to={`/create/${id}/review`} replace />;
  return (
    <PageWidth>
      <ClarifyStage
        handoff={q.data}
        sending={answer.isPending}
        error={answer.isError ? errorMessage(answer.error, "Couldn't save the answer. Try again.") : null}
        onAnswer={(qid, input) => answer.mutate({ qid, input })}
        onContinue={() => navigate(`/create/${id}/review`)}
      />
    </PageWidth>
  );
}

// Step 3 of 3: facts on the left, the source transcript on the right.
export function ReviewPage() {
  const { id, q } = useLoaded();
  const qc = useQueryClient();
  const flow = useFlow();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<(Blocker | string)[] | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["handoff", id] });

  const patch = useMutation({
    mutationFn: ({ factId, p }: { factId: string; p: FactPatch }) => patchFact(factId, p),
    onSuccess: () => {
      setBlockers(null);
      return refresh();
    },
  });
  const routine = useMutation({ mutationFn: () => confirmRoutine(id), onSuccess: refresh });
  const submit = useMutation({
    mutationFn: () => submitHandoff(id),
    onMutate: () => setBlockers(null),
    onSuccess: () => {
      flow.stop();
      return refresh();
    },
    onError: (e) => e instanceof SubmitBlockedError && setBlockers(e.blockers),
  });

  if (!q.data) return <Loading q={q} />;
  const h = q.data;
  const editable = isEditable(h.state);
  const facts = h.items.flatMap((i) => i.facts);

  return (
    <PageWidth wide>
      {!editable && (
        <Card className="mb-6 flex flex-col gap-4 p-5">
          <Notice tone="ok" title={`Submitted to ${h.incoming.name}`}>
            The incoming lead now sees the briefing. Submitting doesn't close open issues or confirm anything is safe.
          </Notice>
          <StatusLine handoff={h} />
          <div className="flex flex-wrap gap-2">
            <Link to={`/receive/${h.id}`} className="inline-flex min-h-touch items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
              Open the incoming view →
            </Link>
            <Button
              onClick={() => {
                flow.reset();
                navigate("/create");
              }}
            >
              Start a new handoff
            </Button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0">
          <ReviewStage
            handoff={h}
            editable={editable}
            busyFactId={patch.isPending ? patch.variables.factId : null}
            selectedFactId={selected}
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
            onSelectFact={setSelected}
            onPatch={(factId, p) => patch.mutate({ factId, p })}
            onConfirmRoutine={() => routine.mutate()}
            onSubmit={() => !submit.isPending && submit.mutate()}
          />
        </div>
        <aside aria-label="Evidence" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <SourcePanel statements={h.statements} facts={facts} questions={h.questions} selectedFact={facts.find((f) => f.id === selected) ?? null} />
        </aside>
      </div>
    </PageWidth>
  );
}
