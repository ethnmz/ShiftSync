import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { FIXTURE_MODE, errorMessage, listHandoffs, loadOfflineDemo } from "../../api/client";
import type { HandoffSummary } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import { Button, Card, Chip, Notice, Skeleton } from "../../components/ui";
import { formatClock } from "../../labels";

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 lg:px-8">
        {list.isLoading ? (
          <Card className="p-4">
            <Skeleton />
          </Card>
        ) : list.isError ? (
          <Notice tone="danger" role="alert" title="Couldn't load handoffs" action={<Button size="sm" onClick={() => list.refetch()}>Retry</Button>}>
            {errorMessage(list.error, "The request failed.")}
          </Notice>
        ) : rows.length === 0 ? (
          <Card className="flex flex-col items-start gap-3 p-5">
            <h2 className="font-semibold">No submitted handoffs yet</h2>
            <p className="text-sm text-muted">A handoff shows up here after Shift A reviews and submits it on the Create screen.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/create" className="inline-flex min-h-touch items-center rounded-lg border border-line-strong px-4 text-sm font-semibold">
                Go to Create
              </Link>
              {FIXTURE_MODE && (
                <Button variant="primary" onClick={() => demo.mutate()} disabled={demo.isPending}>
                  {demo.isPending ? "Loading…" : "Load the scripted demo handoff"}
                </Button>
              )}
            </div>
            {FIXTURE_MODE && (
              <p className="text-xs text-faint">Offline demo: replays steps 1–6 of demo/scenario.json in the browser. No backend is involved.</p>
            )}
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {rows.map((h) => (
                <li key={h.id}>
                  <Link to={`/receive/${h.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-subtle">
                    <span className="font-mono text-sm">{h.id}</span>
                    {h.outgoing && h.incoming && (
                      <span className="text-sm">
                        {h.outgoing.name} → {h.incoming.name}
                      </span>
                    )}
                    <Chip tone="accent">{h.state.replace(/_/g, " ")}</Chip>
                    {h.status_line?.submitted_at && <span className="text-sm text-muted">Submitted {formatClock(h.status_line.submitted_at)}</span>}
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
