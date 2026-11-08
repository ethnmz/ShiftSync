import type { Fact, FactPatch, FollowUp, HandoffDetail, Question } from "../types";
import { isRaise } from "../../review";
import clarifying from "./handoff_clarifying.json";

// Fixture-mode stand-in for the backend. Answers replay steps 3-5 of
// demo/scenario.json so the Create screen can be rehearsed without a server.
// Quotes are verbatim from the scenario answers; values and why_asked tags are
// fixture wording, not backend output.

type Step = {
  answerText: string;
  at: string;
  addFacts: { itemId: string; facts: Fact[] }[];
  itemPatch?: { itemId: string; title?: string; asset_ids?: string[] };
  followups?: FollowUp[];
  next?: Question;
  notAsked?: HandoffDetail["not_asked"];
};

function fact(f: Omit<Fact, "review_state" | "history" | "normalized"> & { normalized?: string }): Fact {
  return { normalized: null, review_state: "ai_extracted", history: [], ...f };
}

const STEPS: Record<string, Step> = {
  "Q-1": {
    answerText:
      "The replacement battery module didn't arrive, so the vendor couldn't do the final load test. That's what they're coming back for.",
    at: "2026-11-08T12:36:20Z",
    addFacts: [
      {
        itemId: "I-1",
        facts: [
          fact({ id: "F-6", slot: "remaining_work", value: "Final load test", certainty: "confirmed",
                 certainty_reason: "operator stated", quote: "the vendor couldn't do the final load test", source_statement_id: "S-2" }),
          fact({ id: "F-7", slot: "rationale", value: "Replacement battery module didn't arrive", certainty: "confirmed",
                 certainty_reason: "operator stated", quote: "The replacement battery module didn't arrive", source_statement_id: "S-2" }),
        ],
      },
    ],
    next: {
      id: "Q-2", item_id: "I-1", gap_type: "missing_required", status: "pending",
      text: "Is UPS-B currently cleared for normal operation?",
      why_asked: "Required for power work: operational clearance",
    },
  },
  "Q-2": {
    answerText:
      "No. It's still in maintenance bypass. It's not cleared until the vendor finishes the load test and signs off.",
    at: "2026-11-08T12:37:10Z",
    addFacts: [
      {
        itemId: "I-1",
        facts: [
          fact({ id: "F-8", slot: "operational_clearance", value: "Not cleared: in maintenance bypass", normalized: "not_cleared",
                 certainty: "confirmed", certainty_reason: "operator stated", quote: "It's still in maintenance bypass.", source_statement_id: "S-3" }),
          fact({ id: "F-9", slot: "required_verification", value: "Vendor finishes the load test and signs off", certainty: "confirmed",
                 certainty_reason: "operator stated", quote: "It's not cleared until the vendor finishes the load test and signs off.", source_statement_id: "S-3" }),
        ],
      },
    ],
    followups: [
      { id: "FU-1", item_id: "I-1", description: "Vendor to finish the UPS-B load test and sign off",
        missing_information: "Vendor sign-off", owner: null, owner_label: "To be assigned", deadline: null, status: "open" },
    ],
    next: {
      id: "Q-3", item_id: "I-3", gap_type: "uncertain_claim", status: "pending",
      text: "You said you're \"not sure\" what happened with the cooling inspection. Which equipment was it, and is anything confirmed about the result?",
      why_asked: "\"not sure\": which equipment, and what is known?",
    },
  },
  "Q-3": {
    answerText:
      "It was Chiller 2. The vendor was here in the afternoon but I never got a report. I honestly don't know if they finished.",
    at: "2026-11-08T12:38:00Z",
    itemPatch: { itemId: "I-3", title: "Chiller 2 cooling inspection", asset_ids: ["CHL-2"] },
    addFacts: [
      {
        itemId: "I-3",
        facts: [
          fact({ id: "F-10", slot: "equipment_scope", value: "Chiller 2", certainty: "confirmed",
                 certainty_reason: "operator stated", quote: "It was Chiller 2.", source_statement_id: "S-4" }),
        ],
      },
    ],
    followups: [
      { id: "FU-2", item_id: "I-3", description: "Confirm what the Chiller 2 cooling inspection found / whether it was completed",
        missing_information: "Vendor inspection report", owner: null, owner_label: "To be assigned", deadline: null, status: "open" },
    ],
    notAsked: [
      { item_id: "I-4", slots: ["scope"], reason: "budget" },
      { item_id: "I-1", slots: ["owner"], reason: "budget" },
    ],
  },
};

// demo/scenario.json step 6 timestamp.
const SUBMITTED_AT = "2026-11-08T12:39:30Z";

// Questions whose slots are `safety: true` in config/slots.yaml (Q-2 asks
// operational_clearance, Q-3 asks work_status). Pending ones block submit.
const SAFETY_QUESTIONS = new Set(["Q-2", "Q-3"]);

function emptyDraft(): HandoffDetail {
  const d = structuredClone(clarifying) as HandoffDetail;
  return { ...d, state: "draft", statements: [], items: [], questions: [], not_asked: [], budget: { ...d.budget, used: 0 } };
}

let current: HandoffDetail = emptyDraft();

function snapshot(): HandoffDetail {
  return structuredClone(current);
}

function nextStatementId() {
  return `S-${current.statements.length + 1}`;
}

export function simCreate() {
  current = emptyDraft();
  return { id: current.id, state: current.state };
}

// The first note replays scenario step 2 (the fixture), whatever was said or
// typed, because fixture mode has no transcription or extraction. Later notes
// are kept as statements but add no facts.
export function simStatement(text: string | null): HandoffDetail {
  if (current.statements.length === 0) {
    current = structuredClone(clarifying) as HandoffDetail;
    return snapshot();
  }
  current.statements.push({
    id: nextStatementId(),
    speaker_id: current.outgoing.id,
    role: "handoff",
    text: text ?? "(Voice note. Fixture mode does not transcribe.)",
    at: new Date().toISOString(),
  });
  return snapshot();
}

function findFact(factId: string): Fact | undefined {
  return current.items.flatMap((i) => i.facts).find((f) => f.id === factId);
}

export function simPatchFact(factId: string, patch: FactPatch): null {
  const f = findFact(factId);
  if (!f) throw new Error(`Unknown fact ${factId}`);
  if (patch.certainty && isRaise(f.certainty, patch.certainty) && !patch.text?.trim()) {
    throw new Error("Raising certainty needs a statement.");
  }
  f.history.push({ value: f.value, certainty: f.certainty, review_state: f.review_state });
  if (patch.text?.trim()) {
    const id = nextStatementId();
    current.statements.push({ id, speaker_id: current.outgoing.id, role: "review_edit", text: patch.text.trim(), at: new Date().toISOString() });
    f.source_statement_id = id;
    f.quote = patch.text.trim();
    f.certainty_reason = "operator stated";
  }
  if (patch.value !== undefined) f.value = patch.value;
  if (patch.normalized !== undefined) f.normalized = patch.normalized;
  if (patch.certainty) f.certainty = patch.certainty;
  f.review_state = patch.review_state;
  return null;
}

export function simConfirmRoutine(): null {
  for (const item of current.items) {
    if (item.priority === "critical") continue;
    for (const f of item.facts) if (f.review_state === "ai_extracted") f.review_state = "operator_confirmed";
  }
  return null;
}

// Returns blockers (fixture wording); empty means submitted.
export function simSubmit(): string[] {
  const blockers: string[] = [];
  for (const item of current.items) {
    if (item.priority !== "critical") continue;
    for (const f of item.facts) {
      if (f.review_state === "ai_extracted") blockers.push(`${item.title}: ${f.slot} is not reviewed`);
    }
  }
  for (const q of current.questions) {
    if (q.status === "pending" && SAFETY_QUESTIONS.has(q.id)) blockers.push(`Safety question still open: ${q.text}`);
  }
  if (blockers.length === 0) {
    current.state = "submitted";
    current.status_line.submitted_at = SUBMITTED_AT;
  }
  return blockers;
}

export function simGet(): HandoffDetail {
  return snapshot();
}

// text: what the operator typed. Voice has no transcription in fixture mode,
// so the scenario's answer stands in for the transcript.
export function simAnswer(questionId: string, answer: { text?: string; dontKnow?: boolean }): HandoffDetail {
  const step = STEPS[questionId];
  const q = current.questions.find((x) => x.id === questionId);
  if (!step || !q || q.status !== "pending") return snapshot();

  const statementId = nextStatementId();
  current.statements.push({
    id: statementId,
    speaker_id: current.outgoing.id,
    role: "clarification_answer",
    text: answer.dontKnow ? "I don't know." : answer.text ?? step.answerText,
    at: step.at,
    question_id: questionId,
  });
  q.status = answer.dontKnow ? "answered_unknown" : "answered";

  if (!answer.dontKnow) {
    for (const { itemId, facts } of step.addFacts) {
      const item = current.items.find((i) => i.id === itemId);
      item?.facts.push(...facts.map((f) => ({ ...f, source_statement_id: statementId })));
    }
    if (step.itemPatch) {
      const { itemId, ...patch } = step.itemPatch;
      Object.assign(current.items.find((i) => i.id === itemId) ?? {}, patch);
    }
  }
  current.followups.push(...(step.followups ?? []));
  current.not_asked.push(...(step.notAsked ?? []));
  current.status_line.open_followups = current.followups.filter((f) => f.status !== "closed").length;
  current.status_line.unassigned_followups = current.followups.filter((f) => !f.owner).length;

  if (step.next) {
    current.questions.push(step.next);
    current.budget.used += 1;
  } else {
    current.state = "in_review";
  }
  return snapshot();
}
