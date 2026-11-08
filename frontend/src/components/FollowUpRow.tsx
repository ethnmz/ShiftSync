import type { FollowUp } from "../api/types";
import { formatWhen } from "../labels";

// Display only on Create. Assigning an owner is lead/supervisor work on
// Receive and Supervisor (docs/API.md PATCH /followups).
export default function FollowUpRow({ followup, itemTitle }: { followup: FollowUp; itemTitle?: string }) {
  const unassigned = followup.owner === null;
  return (
    <li className="rounded-lg border border-line bg-bg p-3 text-sm">
      {itemTitle && <p className="text-xs uppercase tracking-wide text-muted">{itemTitle}</p>}
      <p className="font-medium">{followup.description}</p>
      <p className="mt-1 text-muted">Missing: {followup.missing_information}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${unassigned ? "bg-amber-500/15 text-amber-500" : "bg-line"}`}>
          Owner: {followup.owner_label}
        </span>
        <span className="rounded-full bg-line px-2 py-0.5 text-xs">
          Deadline: {formatWhen(followup.deadline) ?? "not set"}
        </span>
      </div>
    </li>
  );
}
