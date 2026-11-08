import type { Certainty, ReviewState } from "../api/types";
import { Chip, type Tone } from "./ui";

// docs/UI.md shared visual language: icon + word + color, never color alone.
export const CERTAINTY: Record<Certainty, { icon: string; label: string; tone: Tone; hint: string }> = {
  confirmed: { icon: "✓", label: "Confirmed", tone: "ok", hint: "Stated first-hand, no hedging" },
  reported: { icon: "◔", label: "Reported", tone: "info", hint: "Observation or second-hand, not verified" },
  unverified: { icon: "⚠", label: "Unverified", tone: "warn", hint: "A specific claim, but hedged or not verified" },
  unknown: { icon: "?", label: "Unknown", tone: "unk", hint: "The state itself is not known" },
};

export default function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  const c = CERTAINTY[certainty];
  return (
    <Chip tone={c.tone} icon={c.icon} title={`Certainty: ${c.hint}`}>
      {c.label}
    </Chip>
  );
}

// Review state is separate from certainty (docs/DATA_MODEL.md): a reviewed
// "Unknown" is still unknown, so this chip never says "Confirmed".
export function ReviewChip({ state }: { state: ReviewState }) {
  if (state === "ai_extracted")
    return (
      <Chip tone="accent" title="Extracted by AI. The operator has not checked it yet.">
        AI · not checked
      </Chip>
    );
  if (state === "operator_edited")
    return (
      <Chip tone="neutral" icon="✎" title="Edited by the operator">
        Edited
      </Chip>
    );
  if (state === "operator_rejected")
    return (
      <Chip tone="danger" icon="✕" title="The operator marked the AI extraction as wrong">
        Removed
      </Chip>
    );
  return (
    <Chip tone="neutral" icon="✓" title="The operator checked that this was recorded correctly. Certainty is unchanged.">
      Checked
    </Chip>
  );
}
