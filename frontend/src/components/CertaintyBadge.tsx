import type { Certainty, ReviewState } from "../api/types";

// docs/UI.md shared visual language: icon + word + color, never color alone.
export const CERTAINTY = {
  confirmed: { icon: "✓", label: "Confirmed", cls: "bg-green-500/15 text-green-500 ring-green-500/40" },
  reported: { icon: "◔", label: "Reported", cls: "bg-blue-500/15 text-blue-400 ring-blue-500/40" },
  unverified: { icon: "⚠", label: "Unverified", cls: "bg-amber-500/15 text-amber-500 ring-amber-500/40" },
  unknown: { icon: "?", label: "Unknown", cls: "bg-violet-500/15 text-violet-400 ring-violet-500/40" },
} as const satisfies Record<Certainty, { icon: string; label: string; cls: string }>;

export default function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  const c = CERTAINTY[certainty];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 transition-colors duration-500 ${c.cls}`}
    >
      <span aria-hidden>{c.icon}</span>
      {c.label}
    </span>
  );
}

// Review state is separate from certainty (docs/DATA_MODEL.md): a reviewed
// "Unknown" is still unknown, so the chip never says "Confirmed".
export function ReviewChip({ state }: { state: ReviewState }) {
  if (state === "ai_extracted")
    return (
      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-accent" title="Extracted by AI, not reviewed yet">
        AI
      </span>
    );
  if (state === "operator_edited")
    return (
      <span className="rounded bg-line px-1.5 py-0.5 text-[11px] font-semibold text-ink/80" title="Edited by the operator">
        ✎ Edited
      </span>
    );
  if (state === "operator_rejected")
    return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">Removed</span>;
  return <span className="rounded bg-line px-1.5 py-0.5 text-[11px] font-semibold text-ink/80">Reviewed</span>;
}
