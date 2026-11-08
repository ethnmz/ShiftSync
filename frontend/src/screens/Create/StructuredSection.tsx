import type { FactPatch, HandoffDetail } from "../../api/types";
import EquipmentCard from "../../components/EquipmentCard";
import FollowUpRow from "../../components/FollowUpRow";
import Panel from "../../components/Panel";
import { byPriority, isEditable } from "../../review";

export default function StructuredSection({
  handoff,
  busyFactId,
  error,
  onPatch,
}: {
  handoff: HandoffDetail | null;
  busyFactId: string | null;
  error: string | null;
  onPatch: (factId: string, patch: FactPatch) => void;
}) {
  const items = handoff ? byPriority(handoff.items) : [];
  const editable = handoff ? isEditable(handoff.state) : false;
  const titleOf = (id: string) => handoff?.items.find((i) => i.id === id)?.title;

  return (
    <Panel step={3} title="Structured handoff">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
          Equipment cards and facts appear here as they are extracted.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <EquipmentCard key={item.id} item={item} editable={editable} busyFactId={busyFactId} onPatch={onPatch} />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-amber-500">⚠ {error}</p>}

      <div className="mt-auto">
        <h3 className="mb-2 text-sm font-medium text-muted">Follow-ups</h3>
        {!handoff || handoff.followups.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {handoff.followups.map((f) => (
              <FollowUpRow key={f.id} followup={f} itemTitle={titleOf(f.item_id)} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
