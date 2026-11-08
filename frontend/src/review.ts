import type { Certainty, Fact, HandoffDetail, HandoffState, Item } from "./api/types";

// Lowest to highest (docs/DATA_MODEL.md certainty levels).
const CERTAINTY_RANK: Record<Certainty, number> = { unknown: 0, unverified: 1, reported: 2, confirmed: 3 };

// Raising certainty needs a new operator statement (docs/API.md PATCH /facts).
export function isRaise(from: Certainty, to: Certainty) {
  return CERTAINTY_RANK[to] > CERTAINTY_RANK[from];
}

// Shift A may still change the handoff in these states.
const EDITABLE: HandoffState[] = ["draft", "analyzing", "clarifying", "in_review"];
export function isEditable(state: HandoffState) {
  return EDITABLE.includes(state);
}

export function criticalUnreviewed(handoff: HandoffDetail): { item: Item; fact: Fact }[] {
  return handoff.items
    .filter((i) => i.priority === "critical")
    .flatMap((item) => item.facts.filter((f) => f.review_state === "ai_extracted").map((fact) => ({ item, fact })));
}

export function routineUnreviewed(handoff: HandoffDetail): Fact[] {
  return handoff.items
    .filter((i) => i.priority !== "critical")
    .flatMap((i) => i.facts.filter((f) => f.review_state === "ai_extracted"));
}

// Only the blocker the payload can show for sure. Whether a pending question is
// on a safety slot is not in the API shape, so the backend's 409 decides that.
export function submitDisabledReason(handoff: HandoffDetail | null): string | null {
  if (!handoff || handoff.items.length === 0) return "Record or type a note to begin.";
  if (!isEditable(handoff.state)) return "Already submitted.";
  const n = criticalUnreviewed(handoff).length;
  if (n > 0) return `${n} critical ${n === 1 ? "fact needs" : "facts need"} a ✓ check.`;
  return null;
}

const PRIORITY_RANK = { critical: 0, important: 1, routine: 2 } as const;
export function byPriority(items: Item[]) {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
