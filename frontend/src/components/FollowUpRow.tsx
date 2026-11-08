import type { FollowUp } from "../api/types";
import { formatWhen } from "../labels";
import { Chip } from "./ui";

// docs/API.md shows owner as null; ethnmz/hackutd2026#10 proposes {id, name}.
export function ownerName(f: FollowUp) {
  if (!f.owner) return null;
  return typeof f.owner === "string" ? f.owner : f.owner.name;
}

export default function FollowUpRow({ followup, itemTitle, children }: { followup: FollowUp; itemTitle?: string; children?: React.ReactNode }) {
  const owner = ownerName(followup);
  const closed = followup.status === "closed";
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {itemTitle && <span className="text-xs font-medium uppercase tracking-wide text-muted">{itemTitle}</span>}
        {closed && <Chip tone="neutral" icon="✓">Closed</Chip>}
      </div>
      <p className={`font-medium ${closed ? "text-faint line-through" : ""}`}>{followup.description}</p>
      <p className="text-muted">Missing: {followup.missing_information}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={owner ? "neutral" : "warn"} icon={owner ? "●" : "○"}>
          Owner: {followup.owner_label}
        </Chip>
        <Chip tone="neutral" icon="◷">
          Due: {formatWhen(followup.deadline) ?? "not set"}
        </Chip>
      </div>
      {children}
    </li>
  );
}
