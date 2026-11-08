import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { acknowledge, errorMessage, getBriefing, getHandoff } from "../../api/client";
import type { BriefingLine, Item } from "../../api/types";
import { PageHeader } from "../../components/AppShell";
import Transcript, { TranscriptHeader } from "../../components/Transcript";
import Workspace, { TabBar } from "../../components/Workspace";
import CertaintyBadge from "../../components/CertaintyBadge";
import FactRow from "../../components/FactRow";
import { Button, Card, Chip, Notice, PropRow, Skeleton, Spinner } from "../../components/ui";
import { formatClock, formatWhen } from "../../labels";
import { byPriority, isEditable } from "../../review";
import { useUser } from "../../session/user";
import FollowUps from "./FollowUps";
import UnderstandingCheck from "./UnderstandingCheck";

function BriefingRow({ line, onSelect }: { line: BriefingLine; onSelect: (factId: string) => void }) {
  return (
    <li className="flex items-start gap-3 py-4 first:pt-0">
      <CertaintyBadge certainty={line.certainty} />
      <p className="min-w-0 flex-1 leading-relaxed">{line.text}</p>
      {line.fact_ids.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => onSelect(line.fact_ids[0])} title="Show what was said">
          ❝ Source
        </Button>
      )}
    </li>
  );
}

function ItemCard({ item, selectedFactId, onSelect }: { item: Item; selectedFactId: string | null; onSelect: (factId: string) => void }) {
  const unresolved = item.facts.some((f) => f.certainty === "unknown" || f.certainty === "unverified");
  const tone = item.priority === "critical" ? "danger" : item.priority === "important" ? "warn" : "neutral";
  const body = (
    <ul className="flex flex-col gap-1 p-1.5">
      {item.facts
        .filter((f) => f.review_state !== "operator_rejected")
        .map((f) => (
          <FactRow key={f.id} fact={f} itemTitle={item.title} editable={false} busy={false} selected={selectedFactId === f.id} onSelect={() => onSelect(f.id)} />
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
  const [center, setCenter] = useState<"briefing" | "transcript">("briefing");
  const [panel, setPanel] = useState<"status" | "check" | "source">("status");
  const [selected, setSelected] = useState<string | null>(null);

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

  const facts = handoff.items.flatMap((i) => i.facts);
  const fact = facts.find((f) => f.id === selected) ?? null;
  const factItem = fact ? handoff.items.find((i) => i.facts.some((f) => f.id === fact.id)) : null;
  const select = (fid: string) => {
    setSelected(fid);
    setPanel("source");
  };

  const status = (
    <div className="flex flex-col gap-6">
      <div>
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
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={() => ack.mutate()} disabled={ack.isPending || !isIncoming}>
              {ack.isPending ? "Acknowledging…" : "Acknowledge receipt"}
            </Button>
            <p className="text-sm text-muted">
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
          <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
            <p className="text-sm text-muted">Acknowledged, understanding not yet verified.</p>
            <Button size="sm" onClick={() => setPanel("check")}>
              Go to the understanding check →
            </Button>
          </div>
        )}
      </div>
      <FollowUps handoff={handoff} onChanged={refresh} />
    </div>
  );

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
          </>
        }
      />

      <Workspace
        flush
        main={
          <div className="flex flex-col gap-8">
            <TabBar
              label="Handoff view"
              tabs={[
                { id: "briefing", label: "Briefing" },
                { id: "transcript", label: "Transcript" },
              ]}
              value={center}
              onChange={setCenter}
            />
            {center === "briefing" ? (
              <>
                {briefing && <Notice tone="neutral">{briefing.disclaimer}</Notice>}
                <section className="flex flex-col gap-4">
                  {briefingQ.isLoading ? (
                    <Spinner label="Loading the briefing…" />
                  ) : briefingQ.isError ? (
                    <Notice tone="danger" role="alert" action={<Button size="sm" onClick={() => briefingQ.refetch()}>Retry</Button>}>
                      {errorMessage(briefingQ.error, "Couldn't load the briefing.")}
                    </Notice>
                  ) : (
                    <h2 className="text-2xl font-semibold leading-snug">{briefing?.headline}</h2>
                  )}
                  {briefing && (
                    <ul className="flex flex-col divide-y divide-line">
                      {briefing.lines.map((l, i) => (
                        <BriefingRow key={`${l.item_id}-${i}`} line={l} onSelect={select} />
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="items" className="flex flex-col gap-3">
                  <h2 id="items" className="text-xl font-semibold">
                    What you're taking over
                  </h2>
                  {items.map((item) => (
                    <ItemCard key={item.id} item={item} selectedFactId={selected} onSelect={select} />
                  ))}
                </section>
              </>
            ) : (
              <>
                <TranscriptHeader statements={handoff.statements} items={handoff.items} />
                <Transcript statements={handoff.statements} facts={facts} questions={handoff.questions} selectedFact={fact} onSelectFact={select} />
              </>
            )}
          </div>
        }
        panelTabs={
          <TabBar
            label="Receive panel"
            tabs={[
              { id: "status", label: "Status" },
              { id: "check", label: "Check" },
              { id: "source", label: "Source" },
            ]}
            value={panel}
            onChange={setPanel}
          />
        }
        panel={
          panel === "status" ? (
            status
          ) : panel === "check" ? (
            <UnderstandingCheck handoff={handoff} onChanged={refresh} />
          ) : fact && factItem ? (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-sm text-muted">Selected fact</p>
                <h3 className="text-xl font-semibold">{factItem.title}</h3>
              </div>
              <ul className="-mx-3">
                <FactRow fact={fact} itemTitle={factItem.title} editable={false} busy={false} />
              </ul>
              <div className="border-t border-line pt-5">
                <p className="mb-4 text-sm text-muted">Where it came from</p>
                <Transcript statements={handoff.statements.filter((x) => x.id === fact.source_statement_id)} facts={facts} questions={handoff.questions} selectedFact={fact} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-lg font-semibold">Pick a line to check</p>
              <p className="max-w-xs text-muted">Select Source on a briefing line, a quote, or an underlined line in the transcript to see what was said.</p>
            </div>
          )
        }
      />
    </div>
  );
}
