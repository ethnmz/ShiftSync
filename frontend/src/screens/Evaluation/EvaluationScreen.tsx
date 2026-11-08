import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FIXTURE_MODE, errorMessage, getEvalResults, runEval } from "../../api/client";
import type { EvalCondition, EvalExamples, EvalResults, Stat } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import { Button, Card, Notice, Panel, Skeleton, Spinner } from "../../components/ui";
import { formatWhen } from "../../labels";

// docs/API.md Evaluation: conditions and metrics, in display order.
const CONDITIONS: { id: string; label: string }[] = [
  { id: "normal", label: "Normal handoff" },
  { id: "summary", label: "Basic AI summary" },
  { id: "shiftsync", label: "ShiftSync" },
];
const METRICS: { id: string; label: string; kind: "fraction" | "count" }[] = [
  { id: "critical_facts_transferred", label: "Critical facts transferred", kind: "fraction" },
  { id: "missing_details_detected", label: "Missing details detected", kind: "fraction" },
  { id: "ambiguous_clarified", label: "Ambiguous statements clarified", kind: "fraction" },
  { id: "misunderstandings_prevented", label: "Misunderstandings caught", kind: "fraction" },
  { id: "unknowns_preserved", label: "Unknowns preserved", kind: "fraction" },
  { id: "incorrect_facts_introduced", label: "Incorrect facts introduced by AI", kind: "count" },
  { id: "clarification_questions_asked", label: "Clarification questions asked", kind: "count" },
  { id: "not_asked", label: "Gaps not asked (budget)", kind: "count" },
  { id: "shift_a_words_proxy", label: "Shift A effort (words spoken)", kind: "count" },
  { id: "shift_b_words_proxy", label: "Shift B effort (words read)", kind: "count" },
];

const isStat = (v: unknown): v is Stat => !!v && typeof v === "object" && "mean" in v && "n" in v;
const fmt = (x: number, kind: "fraction" | "count") => (kind === "fraction" ? `${Math.round(x * 100)}%` : Number.isInteger(x) ? String(x) : x.toFixed(1));

function Cell({ v, kind }: { v: EvalCondition[string] | undefined; kind: "fraction" | "count" }) {
  if (!isStat(v)) return <span className="text-faint" title="Doesn't apply to this condition">—</span>;
  return (
    <span className="flex flex-col">
      <span className="font-semibold tabular-nums">{fmt(v.mean, kind)}</span>
      <span className="text-xs tabular-nums text-muted">
        {v.min === v.max ? `n = ${v.n}` : `${fmt(v.min, kind)}–${fmt(v.max, kind)} · n = ${v.n}`}
      </span>
    </span>
  );
}

function ScenarioTable({ name, scenario }: { name: string; scenario: EvalResults["scenarios"][string] }) {
  const conds = CONDITIONS.filter((c) => scenario.conditions[c.id]);
  const known = new Set(METRICS.map((m) => m.id).concat("examples"));
  const extra = [...new Set(Object.values(scenario.conditions).flatMap((c) => Object.keys(c)))].filter((k) => !known.has(k));
  const metrics = [...METRICS, ...extra.map((id) => ({ id, label: id.replace(/_/g, " "), kind: "count" as const }))].filter((m) =>
    conds.some((c) => m.id in scenario.conditions[c.id]),
  );
  const examples = scenario.conditions.shiftsync?.examples as EvalExamples | undefined;
  return (
    <Panel title={name.replace(/_/g, " ")} description={scenario.problem}>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th className="px-2 py-2 font-medium">Metric (mean over runs)</th>
              {conds.map((c) => (
                <th key={c.id} className={`px-2 py-2 font-medium ${c.id === "shiftsync" ? "text-ink" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {metrics.map((m) => (
              <tr key={m.id}>
                <th scope="row" className="px-2 py-3 font-normal">
                  {m.label}
                </th>
                {conds.map((c) => (
                  <td key={c.id} className="px-2 py-3">
                    <Cell v={scenario.conditions[c.id][m.id]} kind={m.kind} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {examples && (examples.artifact || examples.incorrect_statements?.length) && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">ShiftSync examples from run 1</summary>
          {examples.artifact && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-subtle p-3">{examples.artifact}</p>}
          {!!examples.incorrect_statements?.length && (
            <>
              <p className="mt-3 font-semibold">Incorrect statements</p>
              <ul className="mt-1 list-disc pl-5">
                {examples.incorrect_statements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </Panel>
  );
}

// Evaluation (docs/UI.md screen 5, P1; docs/EVALUATION.md). Shows exactly
// what GET /eval/results returns. Nothing is estimated or filled in.
export default function EvaluationScreen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["eval"],
    queryFn: getEvalResults,
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
  const run = useMutation({ mutationFn: () => runEval(3), onSuccess: () => qc.invalidateQueries({ queryKey: ["eval"] }) });
  const r = q.data;
  const scenarios = r ? Object.entries(r.scenarios) : [];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Evaluation"
        meta="ShiftSync against a normal handoff and a basic AI summary, on fictional scenarios."
        actions={
          !FIXTURE_MODE && (
            <Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending || !!r?.running}>
              {r?.running ? "Running…" : "Run the benchmark (3 runs)"}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-6 px-4 pb-16 sm:px-10 lg:px-14">
        {run.isError && (
          <Notice tone="danger" role="alert">
            {errorMessage(run.error, "Couldn't start the benchmark.")}
          </Notice>
        )}
        {q.isError ? (
          <Notice tone="danger" role="alert" title="Couldn't load results" action={<Button size="sm" onClick={() => q.refetch()}>Retry</Button>}>
            {errorMessage(q.error, "The request failed.")}
          </Notice>
        ) : !r ? (
          <Card className="p-6">
            <Skeleton lines={4} />
          </Card>
        ) : (
          <>
            {r.running && (
              <Notice tone="info">
                <Spinner label="A benchmark run is in progress. This page updates when it finishes." />
              </Notice>
            )}
            {r.status === "not_run" ? (
              <Panel title="No results yet" description="Numbers appear here only after a benchmark run completes. Nothing is estimated.">
                <p className="text-muted">Reason from the backend: {r.reason ?? "not given"}</p>
              </Panel>
            ) : (
              <>
                <Panel title="About these numbers">
                  <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="inline text-muted">Generated: </dt>
                      <dd className="inline">{r.generated_at ? formatWhen(r.generated_at) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted">Provider: </dt>
                      <dd className="inline">{r.provider ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted">Runs per scenario: </dt>
                      <dd className="inline">{r.runs ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted">Operators: </dt>
                      <dd className="inline">{r.simulated ? "Simulated (LLM stand-ins for real people)" : "Not marked as simulated"}</dd>
                    </div>
                  </dl>
                  {!!r.method_notes?.length && (
                    <ul className="mt-4 list-disc pl-5 text-sm text-muted">
                      {r.method_notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                </Panel>
                {scenarios.length === 0 ? (
                  <p className="text-muted">The run finished with no scenarios.</p>
                ) : (
                  scenarios.map(([name, s]) => <ScenarioTable key={name} name={name} scenario={s} />)
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
