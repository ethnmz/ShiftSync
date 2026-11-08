import type { HandoffDetail } from "../api/types";
import { formatClock } from "../labels";
import { Chip } from "./ui";

// docs/UI.md status line. Acknowledged and Verified are always separate chips,
// and open follow-ups are listed on their own: neither closes an issue.
export default function StatusLine({ handoff }: { handoff: HandoffDetail }) {
  const s = handoff.status_line;
  const assisted = handoff.state === "verified_with_assistance";
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Handoff status">
      <Chip tone={s.submitted_at ? "ok" : "neutral"} icon={s.submitted_at ? "✓" : "○"}>
        {s.submitted_at ? `Submitted ${formatClock(s.submitted_at)}` : "Not submitted"}
      </Chip>
      <Chip tone={s.acknowledged_at ? "ok" : "neutral"} icon={s.acknowledged_at ? "✓" : "○"}>
        {s.acknowledged_at ? `Acknowledged ${formatClock(s.acknowledged_at)}` : "Not acknowledged"}
      </Chip>
      <Chip tone={s.verified_at ? "ok" : "neutral"} icon={s.verified_at ? "✓" : "○"}>
        {s.verified_at
          ? `Understanding verified ${formatClock(s.verified_at)}${assisted ? " (with assistance)" : ""}`
          : "Understanding not verified"}
      </Chip>
      <Chip tone={s.open_followups ? "warn" : "neutral"} icon="↻">
        {s.open_followups} open follow-up{s.open_followups === 1 ? "" : "s"}
        {s.unassigned_followups ? ` (${s.unassigned_followups} to be assigned)` : ""}
      </Chip>
    </div>
  );
}
