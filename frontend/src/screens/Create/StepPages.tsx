import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FIXTURE_MODE, SubmitBlockedError, answerQuestion, isAnalysisFailed, isTranscriptionFailed, confirmRoutine, errorMessage, patchFact, submitHandoff, type AnswerInput } from "../../api/client";
import type { Blocker, FactPatch, HandoffDetail, Statement } from "../../api/types";
import FactRow from "../../components/FactRow";
import Transcript, { TranscriptHeader } from "../../components/Transcript";
import StatusLine from "../../components/StatusLine";
import { Button, Card, Notice, Skeleton } from "../../components/ui";
import { isEditable } from "../../review";
import { PageWidth, suggestedStep, useFlow, useHandoffQuery } from "./CreateFlow";
import { ClarifyPanel, ItemSummary, NotAskedList, QAHistory, focusFor } from "./ClarifyStage";
import ReviewStage from "./ReviewStage";
import Workspace, { TabBar } from "../../components/Workspace";
import SourceCheck from "../../components/mascots/SourceCheck";

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

// Recordings made in this tab first; the stored file only in live mode.
function useAudioFor() {
  const flow = useFlow();
  return (s: Statement) => {
    const clip = flow.clips.get(s.id);
    if (clip) return { src: clip.url, peaks: clip.peaks };
    return !FIXTURE_MODE && s.audio_url ? { src: s.audio_url } : null;
  };
}

type Center = "transcript" | "summary";
const CENTER_TABS: { id: Center; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "transcript", label: "Transcript" },
];

// Step 2 of 3: the transcript with the asked-about lines underlined, and the
// question conversation docked on the right.
export function ClarifyPage() {
  const { id, q } = useLoaded();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const audioFor = useAudioFor();
  const [center, setCenter] = useState<Center>("transcript");
  const [panel, setPanel] = useState<"questions" | "skipped">("questions");
  const [selected, setSelected] = useState<string | null>(null);
  const answer = useMutation({
    mutationFn: ({ qid, input }: { qid: string; input: AnswerInput }) => answerQuestion(id, qid, input),
    onSuccess: (d: HandoffDetail) => {
      qc.setQueryData(["handoff", id], d);
      if (!d.questions.some((x) => x.status === "pending")) navigate(`/create/${id}/review`);
    },
    // A failed analysis still stored the answer: refetch so it shows.
    onError: () => qc.invalidateQueries({ queryKey: ["handoff", id] }),
  });
  if (!q.data) return <Loading q={q} />;
  if (!isEditable(q.data.state)) return <Navigate to={`/create/${id}/review`} replace />;
  const h = q.data;
  const facts = h.items.flatMap((i) => i.facts);
  const select = (fid: string) => {
    setSelected(fid);
    setCenter("transcript");
  };

  return (
    <Workspace
      main={
        <div className="flex flex-col gap-8">
          <TabBar label="Handoff view" tabs={CENTER_TABS} value={center} onChange={setCenter} />
          {center === "transcript" ? (
            <>
              <TranscriptHeader statements={h.statements} items={h.items} asking />
              <Transcript
                statements={h.statements}
                facts={facts}
                questions={h.questions}
                focusFactIds={focusFor(h)}
                selectedFact={facts.find((f) => f.id === selected) ?? null}
                onSelectFact={setSelected}
                audioFor={audioFor}
              />
            </>
          ) : (
            <ItemSummary handoff={h} onSelectFact={select} />
          )}
        </div>
      }
      panelTabs={
        <TabBar
          label="Clarify panel"
          tabs={[
            { id: "questions", label: "Questions" },
            { id: "skipped", label: "Not asked" },
          ]}
          value={panel}
          onChange={setPanel}
        />
      }
      panel={
        panel === "questions" ? (
          <ClarifyPanel
            handoff={h}
            sending={answer.isPending}
            error={
              answer.isError
                ? {
                    title: isAnalysisFailed(answer.error)
                      ? "Your answer is saved, but ShiftSync couldn't analyze it"
                      : isTranscriptionFailed(answer.error)
                        ? "The recording is saved, but it couldn't be transcribed"
                        : "The answer wasn't saved",
                    text: errorMessage(answer.error, "Couldn't save the answer. Try again."),
                  }
                : null
            }
            onAnswer={(qid, input) => answer.mutate({ qid, input })}
            onContinue={() => navigate(`/create/${id}/review`)}
          />
        ) : (
          <NotAskedList handoff={h} />
        )
      }
    />
  );
}

// Step 3 of 3: the structured summary (or transcript) in the middle, the
// selected fact's source and the asked questions on the right.
export function ReviewPage() {
  const { id, q } = useLoaded();
  const qc = useQueryClient();
  const flow = useFlow();
  const navigate = useNavigate();
  const audioFor = useAudioFor();
  const [center, setCenter] = useState<Center>("summary");
  const [panel, setPanel] = useState<"source" | "questions">("source");
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
  const fact = facts.find((f) => f.id === selected) ?? null;
  const factItem = fact ? h.items.find((i) => i.facts.some((f) => f.id === fact.id)) : null;
  const source = fact ? h.statements.filter((s) => s.id === fact.source_statement_id) : [];
  const select = (fid: string) => {
    setSelected(fid);
    setPanel("source");
  };

  return (
    <Workspace
      main={
        <div className="flex flex-col gap-8">
          {!editable && (
            <Card className="flex flex-col gap-4 p-5">
              <Notice tone="ok" title={`Submitted to ${h.incoming.name}`}>
                The incoming lead now sees the briefing. Submitting doesn't close open issues or confirm anything is safe.
              </Notice>
              <StatusLine handoff={h} />
              <div className="flex flex-wrap gap-2">
                <Link to={`/receive/${h.id}`} className="inline-flex min-h-touch items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90">
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
          <TabBar label="Handoff view" tabs={CENTER_TABS} value={center} onChange={setCenter} />
          {center === "summary" ? (
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
              onSelectFact={select}
              onPatch={(factId, p) => patch.mutate({ factId, p })}
              onConfirmRoutine={() => routine.mutate()}
              onSubmit={() => !submit.isPending && submit.mutate()}
            />
          ) : (
            <>
              <TranscriptHeader statements={h.statements} items={h.items} />
              <Transcript statements={h.statements} facts={facts} questions={h.questions} selectedFact={fact} onSelectFact={select} audioFor={audioFor} />
            </>
          )}
        </div>
      }
      panelTabs={
        <TabBar
          label="Review panel"
          tabs={[
            { id: "source", label: "Source" },
            { id: "questions", label: "Questions" },
          ]}
          value={panel}
          onChange={setPanel}
        />
      }
      panel={
        panel === "source" ? (
          fact && factItem ? (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-sm text-muted">Selected fact</p>
                <h3 className="text-xl font-semibold">{factItem.title}</h3>
              </div>
              <ul className="-mx-3">
                <FactRow
                  fact={fact}
                  itemTitle={factItem.title}
                  editable={editable}
                  busy={patch.isPending && patch.variables.factId === fact.id}
                  onPatch={(p) => patch.mutate({ factId: fact.id, p })}
                />
              </ul>
              <div className="border-t border-line pt-5">
                <SourceCheck quote={fact.quote} source={source[0]?.text} />
                <Transcript statements={source} facts={facts} questions={h.questions} selectedFact={fact} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-lg font-semibold">Pick a fact to check</p>
              <p className="max-w-xs text-muted">Select a quote in the summary or an underlined line in the transcript to see what was said.</p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-8">
            {h.questions.length === 0 ? <p className="text-muted">No clarification questions were needed.</p> : <QAHistory handoff={h} />}
            <div>
              <h3 className="mb-3 font-semibold">Not asked</h3>
              <NotAskedList handoff={h} />
            </div>
          </div>
        )
      }
    />
  );
}
