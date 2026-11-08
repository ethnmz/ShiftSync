import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, getSupervisorSummary } from "../../api/client";
import { submittedAt, type HandoffSummary } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import { Button, Card, Notice, Panel, Skeleton, StatTile } from "../../components/ui";
import { formatClock } from "../../labels";

function Rows({ rows, empty }: { rows: HandoffSummary[]; empty: string }) {
  if (rows.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="-mx-2 divide-y divide-line">
      {rows.map((h) => (
        <li key={h.id}>
          <Link to={`/receive/${h.id}`} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-subtle">
            <span className="font-mono text-sm">{h.id}</span>
            {h.outgoing && h.incoming && (
              <span>
                {h.outgoing.name} → {h.incoming.name}
              </span>
            )}
            <span className="text-sm text-muted">{h.state.replace(/_/g, " ")}</span>
            {submittedAt(h) && <span className="text-sm text-muted">· submitted {formatClock(submittedAt(h))}</span>}
            <span aria-hidden className="ml-auto text-muted">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Supervisor view (docs/UI.md screen 4, P1): handoff quality only. No
// facility or equipment monitoring. Numbers come straight from
// GET /supervisor/summary; nothing here closes an issue.
export default function SupervisorScreen() {
  const q = useQuery({ queryKey: ["supervisor"], queryFn: getSupervisorSummary, refetchInterval: 3000 });
  const s = q.data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Supervisor" meta="Handoff quality across shifts. This view doesn't monitor equipment or the facility." />
      <div className="flex flex-col gap-6 px-4 pb-16 sm:px-10 lg:px-14">
        {q.isError ? (
          <Notice tone="danger" role="alert" title="Couldn't load the summary" action={<Button size="sm" onClick={() => q.refetch()}>Retry</Button>}>
            {errorMessage(q.error, "The request failed.")}
          </Notice>
        ) : !s ? (
          <Card className="p-6">
            <Skeleton lines={4} />
          </Card>
        ) : (
          <>
            <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Awaiting acknowledgment" value={s.outstanding_acknowledgments.length} tone={s.outstanding_acknowledgments.length ? "warn" : undefined} />
              <StatTile label="Unresolved questions" value={s.unresolved_questions} hint="Clarifications still pending" />
              <StatTile
                label="Understanding verified"
                value={s.verification.verified + s.verification.with_assistance}
                hint={`${s.verification.with_assistance} with assistance · ${s.verification.in_progress} in progress`}
              />
              <StatTile
                label="Open follow-ups"
                value={s.followups.open}
                hint={`${s.followups.unassigned} to be assigned · ${s.followups.overdue} overdue`}
                tone={s.followups.overdue ? "danger" : s.followups.unassigned ? "warn" : undefined}
              />
            </section>
            <p className="text-sm text-muted">
              Verified means the incoming lead's answers matched the handoff. It doesn't prove they understood it, and it doesn't close open issues or show that
              equipment is safe.
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Outstanding acknowledgments" description="Submitted handoffs the incoming lead hasn't acknowledged.">
                <Rows rows={s.outstanding_acknowledgments} empty="Every submitted handoff has been acknowledged." />
              </Panel>
              <Panel title="Pending handoffs" description="Not yet verified.">
                <Rows rows={s.pending_handoffs} empty="No pending handoffs." />
              </Panel>
              <Panel title="Completed today" description="Understanding verified, with or without assistance." className="lg:col-span-2">
                <Rows rows={s.completed_today} empty="Nothing completed today yet." />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
