import type {
  Briefing,
  Certainty,
  CheckStatus,
  Fact,
  FactPatch,
  FollowUp,
  HandoffDetail,
  HandoffSummary,
  Question,
  Verdict,
  VerificationAttempt,
  VerificationCheck,
} from "../types";
import { canAssign, person } from "../../session/roster";
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
  checks = [];
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

export function simGet(id?: string): HandoffDetail {
  if (id && id !== current.id) throw new Error(`Handoff ${id} is not in the offline demo. Only ${current.id} exists.`);
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

// ---------------------------------------------------------------------------
// Shift B (offline demo). Timestamps follow demo/scenario.json steps 7-11.
// Grading here is a scripted keyword check standing in for the backend
// grader, so the screen can be rehearsed. It is not the real verdict logic.
// ---------------------------------------------------------------------------

const ACK_AT = "2026-11-08T13:01:00Z";
const VERIFIED_AT = "2026-11-08T13:04:00Z";
const ATTEMPT_LIMIT = 2; // config/slots.yaml budgets.verification_attempts
const DISCLAIMER =
  "Acknowledging this handoff does not close open issues or confirm equipment is safe to operate.";

const SUBMITTED_STATES = ["submitted", "acknowledged", "verifying", "verified", "verified_with_assistance"];

type SimCheck = VerificationCheck & { attempts: VerificationAttempt[] };
let checks: SimCheck[] = [];

function recount() {
  const open = current.followups.filter((f) => f.status !== "closed");
  current.status_line.open_followups = open.length;
  current.status_line.unassigned_followups = open.filter((f) => !f.owner).length;
}

// Replays demo/scenario.json steps 1-6 through the sim so Receive can be
// opened without walking through Create first. Labeled in the UI.
export function simLoadSubmittedDemo(): HandoffSummary {
  simCreate();
  simStatement(null);
  for (const q of ["Q-1", "Q-2", "Q-3"]) simAnswer(q, {});
  for (const item of current.items)
    if (item.priority === "critical")
      for (const f of item.facts) if (f.review_state === "ai_extracted") f.review_state = "operator_confirmed";
  simConfirmRoutine();
  simSubmit();
  return simList()[0];
}

export function simList(): HandoffSummary[] {
  if (!SUBMITTED_STATES.includes(current.state)) return [];
  const { id, state, outgoing, incoming, status_line } = snapshot();
  return [{ id, state, outgoing, incoming, status_line }];
}

const RANK: Record<Certainty, number> = { unknown: 0, unverified: 1, reported: 2, confirmed: 3 };

export function simBriefing(id: string): Briefing {
  const h = simGet(id);
  const order = { critical: 0, important: 1, routine: 2 } as const;
  const items = [...h.items].sort((a, b) => order[a.priority] - order[b.priority]);
  const live = items.filter((i) => i.open);
  const lines = live.map((item) => {
    const facts = item.facts.filter((f) => f.review_state !== "operator_rejected");
    const lowest = facts.reduce<Certainty>((m, f) => (RANK[f.certainty] < RANK[m] ? f.certainty : m), "confirmed");
    return {
      text: `${item.title}: ${facts.map((f) => f.value).join("; ")}`,
      item_id: item.id,
      fact_ids: facts.map((f) => f.id),
      certainty: lowest,
    };
  });
  const critical = live.filter((i) => i.priority === "critical").map((i) => i.title);
  return {
    headline: critical.length
      ? `${critical.length} critical item${critical.length === 1 ? "" : "s"} need attention: ${critical.join(" and ")}.`
      : "No critical items in this handoff.",
    lines,
    items,
    open_followups: h.followups.filter((f) => f.status !== "closed"),
    disclaimer: DISCLAIMER,
  };
}

export function simAcknowledge(userId: string): null {
  if (userId !== current.incoming.id) throw new Error(`Only ${current.incoming.name}, the incoming lead, can acknowledge this handoff.`);
  if (current.state !== "submitted") return null;
  current.state = "acknowledged";
  current.status_line.acknowledged_at = ACK_AT;
  return null;
}

const CHECK_SCRIPT = [
  { id: "V-1", item_id: "I-1", question: "What is the current status of UPS-B, and what must be verified before testing?" },
  { id: "V-2", item_id: "I-3", question: "What do we know about the Chiller 2 cooling inspection, and who is following up?" },
];

function publicCheck(c: SimCheck): VerificationCheck {
  return structuredClone(c);
}

export function simStartVerification(): VerificationCheck {
  if (current.state !== "acknowledged" && current.state !== "verifying")
    throw new Error("Acknowledge the handoff before starting the understanding check.");
  if (checks.length === 0) checks = CHECK_SCRIPT.map((c) => ({ ...c, status: "pending" as CheckStatus, attempts: [] }));
  current.state = "verifying";
  const next = checks.find((c) => c.status === "pending" || c.status === "needs_clarification") ?? checks[0];
  return publicCheck(next);
}

const factById = (id: string) => current.items.flatMap((i) => i.facts).find((f) => f.id === id);
const COMPLETE = /\b(complete|completed|finished|done|ready)\b/i;
const NEGATION = /\b(not|isn't|isnt|incomplete|unfinished|hasn't|hasnt|never|no)\b|n't\b/i;

function grade(checkId: string, text: string) {
  const t = text.toLowerCase();
  const claimsComplete = COMPLETE.test(t) && !NEGATION.test(t);
  if (checkId === "V-1") {
    const conveyed = [
      /not cleared|bypass/.test(t) && "F-8",
      /load test/.test(t) && "F-6",
      /battery/.test(t) && "F-7",
      /sign/.test(t) && "F-9",
    ].filter(Boolean) as string[];
    const required = ["F-8", "F-6"];
    return { claimsComplete, conveyed, required, contradicted: ["F-1", "F-8"], all: ["F-1", "F-6", "F-7", "F-8", "F-9"] };
  }
  const conveyed = [
    /unknown|don't know|dont know|no report|not sure|never got|no one knows|nobody/.test(t) && "F-4",
    /chiller/.test(t) && "F-10",
  ].filter(Boolean) as string[];
  return { claimsComplete, conveyed, required: ["F-4"], contradicted: ["F-4"], all: ["F-4", "F-10"] };
}

export function simAnswerVerification(checkId: string, text: string | null): VerificationAttempt {
  const c = checks.find((x) => x.id === checkId);
  if (!c) throw new Error(`Unknown check ${checkId}`);
  if (c.status !== "pending") throw new Error("This check is already closed.");
  const answer = text ?? "(Voice answer. Offline demo does not transcribe audio.)";
  const statementId = nextStatementId();
  current.statements.push({ id: statementId, speaker_id: current.incoming.id, role: "verification_answer", text: answer, at: new Date().toISOString() });

  const g = grade(checkId, answer);
  const missing = g.all.filter((id) => !g.conveyed.includes(id) && g.required.includes(id));
  let verdict: Verdict;
  let feedback: string;
  let contradictions: VerificationAttempt["contradictions"] = [];
  if (g.claimsComplete) {
    verdict = "inconsistent";
    contradictions = g.contradicted.map((fact_id) => ({ fact_id, claimed: answer.match(/[^.]*\b(complete|completed|finished|done|ready)\b[^.]*/i)?.[0].trim() ?? answer }));
    feedback =
      checkId === "V-1"
        ? "That interpretation is inconsistent with the handoff. Maintenance remains incomplete, and clearance must be verified through authorized procedures."
        : "That interpretation is inconsistent with the handoff. Nobody has confirmed the inspection result; it is still unknown.";
  } else if (missing.length === 0) {
    verdict = "consistent";
    feedback = "Consistent with the handoff.";
  } else {
    verdict = "partially_consistent";
    feedback = `Partly consistent. The handoff also says: ${missing.map((id) => factById(id)?.value).join("; ")}.${
      checkId === "V-1" ? " Clearance must be verified through authorized procedures." : ""
    }`;
  }

  const evidenceIds = verdict === "consistent" ? [] : g.all;
  const evidence = evidenceIds
    .map((id) => factById(id))
    .filter((f): f is Fact => !!f)
    .map((f) => ({ statement_id: f.source_statement_id, quote: f.quote }));

  const attemptNo = c.attempts.length + 1;
  const status: CheckStatus = verdict === "consistent" ? "verified" : attemptNo >= ATTEMPT_LIMIT ? "needs_clarification" : "pending";
  c.status = status;
  const attempt: VerificationAttempt = {
    check_id: c.id,
    attempt: attemptNo,
    verdict,
    misconception: g.claimsComplete ? (checkId === "V-1" ? "treated_incomplete_as_complete" : "treated_unverified_as_confirmed") : missing.length ? "missed_required_verification" : null,
    conveyed_fact_ids: g.conveyed,
    missing_fact_ids: verdict === "inconsistent" ? g.required.filter((id) => !g.conveyed.includes(id)) : missing,
    contradictions,
    feedback,
    evidence,
    status,
    next_check: null,
    answer_text: answer,
  };
  c.attempts.push(attempt);
  if (status !== "pending") attempt.next_check = nextOpenCheck(c.id);
  finishIfDone();
  return structuredClone(attempt);
}

function nextOpenCheck(afterId: string): VerificationCheck | null {
  const i = checks.findIndex((c) => c.id === afterId);
  const next = checks.slice(i + 1).find((c) => c.status === "pending");
  return next ? publicCheck(next) : null;
}

function finishIfDone() {
  if (checks.length === 0 || !checks.every((c) => c.status === "verified" || c.status === "clarified_in_person")) return;
  current.state = checks.some((c) => c.status === "clarified_in_person") ? "verified_with_assistance" : "verified";
  current.status_line.verified_at = VERIFIED_AT;
}

export function simClarifiedInPerson(checkId: string, note: string, userId: string): VerificationCheck | null {
  const p = person(userId);
  if (p?.role !== "lead") throw new Error("Only a lead can mark a check clarified in person.");
  const c = checks.find((x) => x.id === checkId);
  if (!c || c.status !== "needs_clarification") throw new Error("This check does not need in-person clarification.");
  if (!note.trim()) throw new Error("Add a short note about what was clarified.");
  c.status = "clarified_in_person";
  finishIfDone();
  return nextOpenCheck(c.id);
}

function findFollowup(id: string): FollowUp {
  const f = current.followups.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown follow-up ${id}`);
  return f;
}

export function simAssignFollowup(id: string, ownerId: string, deadline: string | null, userId: string): null {
  const actor = person(userId);
  if (!actor || !canAssign(actor)) throw new Error("Only a lead or supervisor can assign follow-ups.");
  const owner = person(ownerId);
  if (!owner) throw new Error("Pick an owner from the roster.");
  const f = findFollowup(id);
  f.owner = { id: owner.id, name: owner.name };
  f.owner_label = owner.name;
  f.deadline = deadline;
  f.assigned_by = { id: actor.id, name: actor.name };
  f.assigned_at = new Date().toISOString();
  recount();
  return null;
}

export function simCloseFollowup(id: string, text: string, userId: string): null {
  if (!text.trim()) throw new Error("Say who verified what before closing.");
  const f = findFollowup(id);
  current.statements.push({ id: nextStatementId(), speaker_id: userId, role: "followup_update", text: text.trim(), at: new Date().toISOString() });
  f.status = "closed";
  recount();
  return null;
}
