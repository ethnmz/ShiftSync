import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FIXTURE_MODE, acknowledge, errorMessage, getBriefing, getHandoff } from "../../api/client";
import type { BriefingLine, HandoffDetail, Item } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import CertaintyBadge from "../../components/CertaintyBadge";
import FactRow from "../../components/FactRow";
import { Button, Card, Chip, Notice, PropRow, Skeleton, Spinner } from "../../components/ui";
import { formatClock, formatWhen } from "../../labels";
import { byPriority, isEditable } from "../../review";
import { useUser } from "../../session/user";
import FollowUps from "./FollowUps";
import UnderstandingCheck from "./UnderstandingCheck";

function BriefingRow({ line, handoff }: { line: BriefingLine; handoff: HandoffDetail }) {
  const [open, setOpen] = useState(false);
  const facts = handoff.items.flatMap((i) => i.facts).filter((f) => line.fact_ids.includes(f.id));
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <CertaintyBadge certainty={line.certainty} />
        <p className="min-w-0 flex-1 text-sm leading-relaxed">{line.text}</p>
        {facts.length > 0 && (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide source" : "❝ Source"}
          </Button>
        )}
      </div>
      {open && (
        <ul className="ml-1 flex flex-col gap-1.5 border-l-2 border-line pl-3">
          {facts.map((f) => (
            <li key={f.id} className="text-sm">
              <span className="italic">“{f.quote}”</span>
              <span className="ml-2 text-xs text-faint">{handoff.outgoing.name}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ItemCard({ item }: { item: Item }) {
  const unresolved = item.facts.some((f) => f.certainty === "unknown" || f.certainty === "unverified");
  const tone = item.priority === "critical" ? "danger" : item.priority === "important" ? "warn" : "neutral";
  const body = (
    <ul className="flex flex-col gap-1 p-1.5">
      {item.facts
        .filter((f) => f.review_state !== "operator_rejected")
        .map((f) => (
          <FactRow key={f.id} fact={f} itemTitle={item.title} editable={false} busy={false} />
        ))}
    </ul>
  );
  const header = (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <h3 className="font-semibold">{item.title}</h3>
      {item.asset_ids.map((a) => (
        <span key={a} className="rounded border border-line bg-subtle px-1.5 font-mono text-xs">
          {a}
        </span>
      ))}
      {item.carried_over_from && (
        <Chip tone="neutral" icon="↻">
          Carried over from {formatWhen(item.carried_over_from.handoff_created_at)}
        </Chip>
      )}
      {unresolved && (
        <Chip tone="unk" icon="?">
          Unresolved
        </Chip>
      )}
      <span className="ml-auto">
        <Chip tone={tone}>{item.priority[0].toUpperCase() + item.priority.slice(1)}</Chip>
      </span>
    </div>
  );
  return (
    <Card className="overflow-hidden">
      {item.priority === "routine" ? (
        <details>
          <summary className="cursor-pointer list-none">{header}</summary>
          <div className="border-t border-line">{body}</div>
        </details>
      ) : (
        <>
          <div className="border-b border-line">{header}</div>
          {body}
        </>
      )}
    </Card>
  );
}

// Shift B, Receive Handoff (docs/UI.md Screen 2).
export default function ReceiveScreen() {
  const { id = "" } = useParams();
  const { user } = useUser();
  const qc = useQueryClient();
  const handoffQ = useQuery({ queryKey: ["handoff", id], queryFn: () => getHandoff(id), refetchInterval: 1500 });
  const handoff = handoffQ.data;
  const submitted = handoff ? !isEditable(handoff.state) : false;
  const briefingQ = useQuery({
    queryKey: ["briefing", id, handoff?.state],
    queryFn: () => getBriefing(id),
    enabled: submitted,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["handoff", id] });
    qc.invalidateQueries({ queryKey: ["briefing", id] });
  };
  const ack = useMutation({ mutationFn: () => acknowledge(id), onSuccess: refresh });

  if (handoffQ.isLoading)
    return (
      <div className="p-8">
        <Skeleton lines={4} />
      </div>
    );
  if (handoffQ.isError || !handoff)
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Notice tone="danger" role="alert" title={`Couldn't open handoff ${id}`} action={<Button size="sm" onClick={() => handoffQ.refetch()}>Retry</Button>}>
          {errorMessage(handoffQ.error, "The request failed.")}{" "}
          <Link to="/receive" className="underline">
            Back to the list
          </Link>
        </Notice>
      </div>
    );
  if (!submitted)
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Notice tone="warn" title="This handoff hasn't been submitted yet">
          Shift A is still working on it. <Link to="/create" className="underline">Open Create</Link>
        </Notice>
      </div>
    );

  const s = handoff.status_line;
  const briefing = briefingQ.data;
  const items = briefing?.items ?? byPriority(handoff.items);
  const isIncoming = user.id === handoff.incoming.id;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title={`Handoff from ${handoff.outgoing.name}`}
        meta={
          <>
            <Chip tone="neutral">{handoff.id}</Chip>
            <span>
              {handoff.outgoing.name} → {handoff.incoming.name}
            </span>
            {s.submitted_at && <span>Submitted {formatClock(s.submitted_at)}</span>}
            {FIXTURE_MODE && <Chip tone="warn">Offline demo data</Chip>}
          </>
        }
      />

      <div className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="flex min-w-0 flex-col gap-6">
          {briefing && <Notice tone="neutral">{briefing.disclaimer}</Notice>}

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Briefing</h2>
              {briefingQ.isLoading ? (
                <div className="mt-2">
                  <Spinner label="Loading the briefing…" />
                </div>
              ) : briefingQ.isError ? (
                <div className="mt-2">
                  <Notice tone="danger" role="alert" action={<Button size="sm" onClick={() => briefingQ.refetch()}>Retry</Button>}>
                    {errorMessage(briefingQ.error, "Couldn't load the briefing.")}
                  </Notice>
                </div>
              ) : (
                <p className="mt-1 text-lg font-semibold leading-snug">{briefing?.headline}</p>
              )}
            </div>
            {briefing && (
              <ul className="divide-y divide-line">
                {briefing.lines.map((l, i) => (
                  <BriefingRow key={`${l.item_id}-${i}`} line={l} handoff={handoff} />
                ))}
              </ul>
            )}
          </Card>

          <section aria-labelledby="items" className="flex flex-col gap-3">
            <h2 id="items" className="text-xs font-semibold uppercase tracking-wide text-muted">
              What you're taking over
            </h2>
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </section>

          <UnderstandingCheck handoff={handoff} onChanged={refresh} />
        </div>

        {/* Properties panel */}
        <aside aria-label="Handoff details" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="px-4 py-2">
            <dl className="divide-y divide-line">
              <PropRow label="From">{handoff.outgoing.name}</PropRow>
              <PropRow label="To">{handoff.incoming.name}</PropRow>
              <PropRow label="Submitted">{s.submitted_at ? formatClock(s.submitted_at) : "—"}</PropRow>
              <PropRow label="Acknowledged">
                {s.acknowledged_at ? (
                  <Chip tone="ok" icon="✓">
                    {formatClock(s.acknowledged_at)}
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="○">
                    Not yet
                  </Chip>
                )}
              </PropRow>
              <PropRow label="Understanding">
                {s.verified_at ? (
                  <Chip tone="ok" icon="✓">
                    Verified {formatClock(s.verified_at)}
                    {handoff.state === "verified_with_assistance" ? " (assisted)" : ""}
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="○">
                    {handoff.state === "verifying" ? "Check in progress" : "Not verified"}
                  </Chip>
                )}
              </PropRow>
            </dl>
            {handoff.state === "submitted" && (
              <div className="flex flex-col gap-2 border-t border-line py-3">
                <Button onClick={() => ack.mutate()} disabled={ack.isPending || !isIncoming}>
                  {ack.isPending ? "Acknowledging…" : "Acknowledge receipt"}
                </Button>
                <p className="text-xs text-muted">
                  {isIncoming
                    ? "Records that you received this handoff. It doesn't mean you understood it, and it doesn't close anything."
                    : `Only ${handoff.incoming.name} can acknowledge. Switch the demo user.`}
                </p>
                {ack.isError && (
                  <Notice tone="danger" role="alert">
                    {errorMessage(ack.error, "Couldn't record the acknowledgment.")}
                  </Notice>
                )}
              </div>
            )}
            {s.acknowledged_at && !s.verified_at && (
              <p className="border-t border-line py-3 text-xs text-muted">Acknowledged, understanding not yet verified.</p>
            )}
          </Card>

          <FollowUps handoff={handoff} onChanged={refresh} />
        </aside>
      </div>
    </div>
  );
}
