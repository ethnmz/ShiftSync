import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { assignFollowup, closeFollowup, errorMessage } from "../../api/client";
import type { FollowUp, HandoffDetail } from "../../api/types";
import FollowUpRow from "../../components/FollowUpRow";
import { Button, Card, fieldClass, Notice } from "../../components/ui";
import { ROSTER, canAssign, useUser } from "../../session/user";

// datetime-local value (local time) <-> ISO 8601 UTC for the API.
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function AssignForm({ f, onDone }: { f: FollowUp; onDone: () => void }) {
  const current = typeof f.owner === "string" ? f.owner : f.owner?.id ?? "";
  const [owner, setOwner] = useState(current);
  const [deadline, setDeadline] = useState("");
  const m = useMutation({ mutationFn: () => assignFollowup(f.id, owner, toIso(deadline)), onSuccess: onDone });
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-lg border border-line bg-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (owner && !m.isPending) m.mutate();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Owner</span>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} required className={`${fieldClass} min-h-touch cursor-pointer`}>
          <option value="" disabled>
            Pick a person
          </option>
          {ROSTER.filter((p) => p.role !== "vendor").map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role}
              {p.team ? `, ${p.team}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">
          Deadline <span className="font-normal text-faint">(optional)</span>
        </span>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${fieldClass} min-h-touch`} />
      </label>
      {m.isError && (
        <Notice tone="danger" role="alert">
          {errorMessage(m.error, "Couldn't save the assignment.")}
        </Notice>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!owner || m.isPending}>
          {m.isPending ? "Saving…" : "Assign"}
        </Button>
      </div>
    </form>
  );
}

function CloseForm({ f, onDone }: { f: FollowUp; onDone: () => void }) {
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => closeFollowup(f.id, text.trim()), onSuccess: onDone });
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-lg border border-line bg-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !m.isPending) m.mutate();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Who verified what?</span>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Vendor emailed the completion report at 09:40"
          className={`${fieldClass} py-2`}
        />
      </label>
      {m.isError && (
        <Notice tone="danger" role="alert">
          {errorMessage(m.error, "Couldn't close the follow-up.")}
        </Notice>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!text.trim() || m.isPending}>
          {m.isPending ? "Closing…" : "Close with this statement"}
        </Button>
      </div>
    </form>
  );
}

export default function FollowUps({ handoff, onChanged }: { handoff: HandoffDetail; onChanged: () => void }) {
  const { user } = useUser();
  const [open, setOpen] = useState<{ id: string; kind: "assign" | "close" } | null>(null);
  const titleOf = (id: string) => handoff.items.find((i) => i.id === id)?.title;
  const mayAssign = canAssign(user);
  const done = () => {
    setOpen(null);
    onChanged();
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Follow-ups</h2>
        <span className="text-xs text-muted">
          {handoff.status_line.open_followups} open · {handoff.status_line.unassigned_followups} to be assigned
        </span>
      </div>
      {handoff.followups.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No follow-ups.</p>
      ) : (
        <ul className="divide-y divide-line">
          {handoff.followups.map((f) => (
            <FollowUpRow key={f.id} followup={f} itemTitle={titleOf(f.item_id)}>
              {f.status !== "closed" &&
                (open?.id === f.id ? (
                  open.kind === "assign" ? <AssignForm f={f} onDone={done} /> : <CloseForm f={f} onDone={done} />
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {mayAssign && (
                      <Button size="sm" aria-label={`${f.owner ? "Reassign" : "Assign owner for"}: ${f.description}`} onClick={() => setOpen({ id: f.id, kind: "assign" })}>
                        {f.owner ? "Reassign" : "Assign owner"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" aria-label={`Close with a statement: ${f.description}`} onClick={() => setOpen({ id: f.id, kind: "close" })}>
                      Close with a statement
                    </Button>
                  </div>
                ))}
            </FollowUpRow>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
        {mayAssign ? "Assignments are logged with your name." : "Only a lead or supervisor can assign owners."} Follow-ups stay open after the
        handoff is verified.
      </p>
    </Card>
  );
}
