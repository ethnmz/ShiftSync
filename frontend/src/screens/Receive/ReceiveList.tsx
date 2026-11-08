import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { FIXTURE_MODE, errorMessage, listHandoffs, loadOfflineDemo } from "../../api/client";
import { submittedAt, type HandoffSummary } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import { Button, Card, Chip, Notice, Panel, Skeleton } from "../../components/ui";
import { formatClock } from "../../labels";
import Mascot3D from "../../components/mascots/Mascot3D";

const RECEIVABLE = ["submitted", "acknowledged", "verifying", "verified", "verified_with_assistance"];

// Incoming handoffs (GET /handoffs). Pick one to open its briefing.
export default function ReceiveList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ["handoffs"], queryFn: listHandoffs, refetchInterval: 5000 });
  const demo = useMutation({
    mutationFn: loadOfflineDemo,
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ["handoffs"] });
      navigate(`/receive/${h.id}`);
    },
  });
  const rows = (list.data ?? []).filter((h: HandoffSummary) => RECEIVABLE.includes(h.state));

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Receive" meta="Handoffs submitted to the incoming shift" />
      <div className="flex w-full max-w-4xl flex-col gap-4 px-4 pb-10 sm:px-10 lg:px-14">
        {list.isLoading ? (
          <Card className="p-4">
            <Skeleton />
          </Card>
        ) : list.isError ? (
          <Notice tone="danger" role="alert" title="Couldn't load handoffs" action={<Button size="sm" onClick={() => list.refetch()}>Retry</Button>}>
            {errorMessage(list.error, "The request failed.")}
          </Notice>
        ) : rows.length === 0 ? (
          <Panel
            title="No submitted handoffs yet"
            description="A handoff shows up here after Shift A reviews and submits it on the Create screen."
            actions={<Mascot3D kinds={["nimbus"]} width={120} height={110} className="-my-4" />}
          >
            <div className="flex flex-wrap gap-2">
              <Link to="/create" className="inline-flex min-h-touch items-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-subtle">
                Go to Create
              </Link>
              {FIXTURE_MODE && (
                <Button variant="primary" onClick={() => demo.mutate()} disabled={demo.isPending}>
                  {demo.isPending ? "Loading…" : "Load the scripted demo handoff"}
                </Button>
              )}
            </div>
            {FIXTURE_MODE && (
              <p className="mt-4 text-xs text-faint">Offline demo: replays steps 1–6 of demo/scenario.json in the browser. No backend is involved.</p>
            )}
          </Panel>
        ) : (
          <Card className="overflow-hidden rounded-panel">
            <ul className="divide-y divide-line">
              {rows.map((h) => (
                <li key={h.id}>
                  <Link to={`/receive/${h.id}`} className="flex min-h-[56px] flex-wrap items-center gap-3 px-6 py-3 hover:bg-subtle">
                    <span className="font-mono text-sm">{h.id}</span>
                    {h.outgoing && h.incoming && (
                      <span className="text-sm">
                        {h.outgoing.name} → {h.incoming.name}
                      </span>
                    )}
                    <Chip tone="accent">{h.state.replace(/_/g, " ")}</Chip>
                    {submittedAt(h) && <span className="text-sm text-muted">Submitted {formatClock(submittedAt(h))}</span>}
                    <span aria-hidden className="ml-auto text-muted">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
