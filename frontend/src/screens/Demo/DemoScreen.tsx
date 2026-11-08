import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FIXTURE_MODE, demoReset, demoScenario, demoStep, errorMessage } from "../../api/client";
import type { DemoStep } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import { Button, Card, Notice, Panel, Spinner } from "../../components/ui";
import { formatClock } from "../../labels";
import { person, useUser } from "../../session/user";

// Short presenter labels for demo/scenario.json's 12 steps. The scenario file
// stays the source of truth for what each step does.
const LABEL: Record<number, string> = {
  1: "Maya starts a handoff to Jordan",
  2: "Maya records her handoff note",
  3: "Maya answers question 1",
  4: "Maya answers question 2",
  5: "Maya answers question 3",
  6: "Maya checks the critical facts and submits",
  7: "Jordan opens the briefing",
  8: "Jordan acknowledges and takes the Chiller 2 follow-up",
  9: "Understanding check: Jordan's first answer",
  10: "Understanding check: Jordan's second attempt",
  11: "Understanding check: the Chiller 2 question",
  12: "Dana reviews follow-ups and assigns UPS-B",
};

// Which screen shows the result of a step.
function screenFor(step: number, id: string) {
  if (step === 1) return `/create/${id}/record`;
  if (step <= 5) return `/create/${id}/clarify`;
  if (step === 6) return `/create/${id}/review`;
  if (step <= 11) return `/receive/${id}`;
  return "/supervisor";
}

function Result({ r }: { r: DemoStep }) {
  const bits: string[] = [`Handoff ${r.handoff.id} is ${r.handoff.state.replace(/_/g, " ")}`];
  if (r.question_shown) bits.push(`Question shown: “${r.question_shown}”`);
  if (r.attempt) bits.push(`Check verdict: ${r.attempt.verdict.replace(/_/g, " ")}`);
  if (r.before && r.after) bits.push(`Unassigned follow-ups: ${r.before.unassigned} → ${r.after.unassigned}`);
  return <p className="text-sm text-muted">{bits.join(" · ")}</p>;
}

// Live-mode presenter page: resets the backend's demo data and replays the
// scripted scenario one step at a time through the real service code.
export default function DemoScreen() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setUser } = useUser();
  const [results, setResults] = useState<Map<number, DemoStep>>(() => new Map());
  const [liveModel, setLiveModel] = useState(false);
  const scenario = useQuery({ queryKey: ["demo-scenario"], queryFn: demoScenario, enabled: !FIXTURE_MODE });
  const done = results.size ? Math.max(...results.keys()) : 0;
  const handoffId = results.get(done)?.handoff.id;

  const reset = useMutation({
    mutationFn: demoReset,
    onSuccess: () => {
      setResults(new Map());
      return qc.invalidateQueries();
    },
  });
  const run = useMutation({
    // Runs every step from the next one up to `to`, in order.
    mutationFn: async (to: number) => {
      const out: DemoStep[] = [];
      for (let n = done + 1; n <= to; n++) out.push(await demoStep(n, !liveModel));
      return out;
    },
    onSuccess: (out) => {
      setResults((m) => {
        const next = new Map(m);
        out.forEach((r) => next.set(r.step, r));
        return next;
      });
      return qc.invalidateQueries();
    },
    // Partial runs keep what succeeded: refetch so screens match the backend.
    onError: () => qc.invalidateQueries(),
  });

  function open(step: number) {
    const r = results.get(step);
    const to = r && screenFor(step, r.handoff.id);
    if (!r || !to) return;
    setUser(r.actor);
    navigate(to);
  }

  if (FIXTURE_MODE)
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Demo control" />
        <div className="px-4 sm:px-10 lg:px-14">
          <Notice tone="neutral" title="Demo control needs live mode">
            Offline mode already replays the scenario in the browser. Run the backend and start the frontend with VITE_API_MODE=live to use this page.
          </Notice>
        </div>
      </div>
    );

  const steps = scenario.data?.steps ?? [];
  const busy = reset.isPending || run.isPending;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Demo control" meta="Replays demo/scenario.json through the backend, one step at a time. For the synthetic demo only." />
      <div className="flex max-w-4xl flex-col gap-6 px-4 pb-16 sm:px-10 lg:px-14">
        <Panel
          title="Before you start"
          description="Reset drops all backend data and reloads the roster, assets and the carried-over history. Steps must run in order."
          actions={
            <Button variant="primary" onClick={() => reset.mutate()} disabled={busy}>
              {reset.isPending ? "Resetting…" : "Reset demo data"}
            </Button>
          }
        >
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={liveModel} onChange={(e) => setLiveModel(e.target.checked)} disabled={busy} className="mt-0.5 size-4 accent-ink" />
            <span>
              <span className="font-semibold">Use the configured model</span>
              <span className="block text-muted">
                Off: the backend uses fixed AI outputs, so this works with no network. On: steps call the provider in backend/.env and can take much longer.
              </span>
            </span>
          </label>
          {reset.isSuccess && <p className="mt-3 text-sm text-ok">Demo data reset. Demo clock set to {formatClock(reset.data.now)}.</p>}
          {reset.isError && (
            <div className="mt-3">
              <Notice tone="danger" role="alert">
                {errorMessage(reset.error, "Couldn't reset the demo data.")}
              </Notice>
            </div>
          )}
        </Panel>

        {run.isError && (
          <Notice tone="danger" role="alert" title="The step didn't run">
            {(run.error as Error)?.message ?? "The request failed."}
          </Notice>
        )}

        <Card className="overflow-hidden rounded-panel">
          {scenario.isLoading ? (
            <div className="p-6">
              <Spinner label="Loading the scenario…" />
            </div>
          ) : scenario.isError ? (
            <div className="p-6">
              <Notice tone="danger" role="alert">
                {errorMessage(scenario.error, "Couldn't load demo/scenario.json from the backend.")}
              </Notice>
            </div>
          ) : (
            <ol className="divide-y divide-line">
              {steps.map((s) => {
                const r = results.get(s.n);
                const next = s.n === done + 1;
                const target = r && screenFor(s.n, r.handoff.id);
                return (
                  <li key={s.n} className={`flex flex-wrap items-start gap-4 px-6 py-4 ${next ? "bg-subtle/60" : ""}`}>
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${r ? "bg-ink text-white" : "bg-subtle text-muted"}`}>
                      {r ? "✓" : s.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{LABEL[s.n] ?? `Step ${s.n}`}</p>
                      <p className="text-sm text-muted">
                        {person(s.actor)?.name ?? s.actor} · {formatClock(s.at)}
                        {s.text && <> · “{s.text.length > 90 ? `${s.text.slice(0, 90)}…` : s.text}”</>}
                      </p>
                      {r && <Result r={r} />}
                      {r && <p className="text-xs text-faint">{r.offline ? "Fixed AI outputs (offline)" : "Configured model"}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {next && (
                        <Button size="sm" variant="primary" onClick={() => run.mutate(s.n)} disabled={busy}>
                          {run.isPending ? "Running…" : "Run step"}
                        </Button>
                      )}
                      {r && target && (
                        <Button size="sm" onClick={() => open(s.n)} title={`Switches the demo user to ${person(r.actor)?.name ?? r.actor}`}>
                          Open as {person(r.actor)?.name.split(" ")[0] ?? r.actor} →
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {steps.length > 0 && done < 6 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => run.mutate(6)} disabled={busy}>
              Run through step 6 (submitted handoff)
            </Button>
            {handoffId && <span className="text-sm text-muted">Current handoff: {handoffId}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
