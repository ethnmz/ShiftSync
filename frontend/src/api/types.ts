// Mirrors docs/API.md and the enums in docs/DATA_MODEL.md. Only fields the spec
// names are here; add more as screens need them, never ahead of the contract.

export type Certainty = "confirmed" | "reported" | "unverified" | "unknown";
export type ReviewState = "ai_extracted" | "operator_confirmed" | "operator_edited" | "operator_rejected";
export type Priority = "critical" | "important" | "routine";
export type HandoffState =
  | "draft"
  | "analyzing"
  | "clarifying"
  | "in_review"
  | "submitted"
  | "acknowledged"
  | "verifying"
  | "verified"
  | "verified_with_assistance";
export type StatementRole =
  | "handoff"
  | "clarification_answer"
  | "review_edit"
  | "verification_answer"
  | "followup_update";
export type GapType =
  | "vague_statement"
  | "missing_required"
  | "uncertain_claim"
  | "missing_rationale"
  | "missing_condition"
  | "unscoped_claim"
  | "missing_owner_or_deadline";

export interface PersonRef {
  id: string;
  name: string;
}

export interface Handoff {
  id: string;
  state: HandoffState;
}

export interface Statement {
  id: string;
  speaker_id: string;
  role: StatementRole;
  text: string;
  audio_url?: string | null;
  at: string;
  // Set when the statement answers a clarification (docs/DATA_MODEL.md Statement).
  question_id?: string | null;
}

export interface Fact {
  id: string;
  // Proposed in ethnmz/hackutd2026#10 (not merged): AI value kept after an edit.
  ai_proposed_value?: string | null;
  slot: string;
  value: string;
  normalized?: string | null;
  certainty: Certainty;
  certainty_reason: string;
  review_state: ReviewState;
  quote: string;
  source_statement_id: string;
  history: unknown[];
}

export interface Item {
  id: string;
  title: string;
  kind: string;
  asset_ids: string[];
  priority: Priority;
  is_decision: boolean;
  open: boolean;
  facts: Fact[];
  // Proposed in ethnmz/hackutd2026#10 (not merged). Non-null means carried over.
  carried_over_from?: { handoff_id: string; item_id: string; handoff_created_at: string } | null;
}

export interface Question {
  id: string;
  item_id: string;
  gap_type: GapType;
  text: string;
  status: "pending" | "answered" | "answered_unknown" | "not_asked";
  why_asked: string;
}

export interface NotAsked {
  item_id: string;
  slots: string[];
  reason: string;
}

export interface FollowUp {
  id: string;
  item_id: string;
  description: string;
  missing_information: string;
  // docs/API.md only shows null. ethnmz/hackutd2026#10 proposes {id, name};
  // older notes used a roster id. Read it through ownerName().
  owner: PersonRef | string | null;
  owner_label: string;
  deadline: string | null;
  assigned_by?: PersonRef | null;
  assigned_at?: string | null;
  status: "open" | "in_progress" | "closed";
}

export interface StatusLine {
  submitted_at: string | null;
  acknowledged_at: string | null;
  verified_at: string | null;
  open_followups: number;
  unassigned_followups: number;
}

// PATCH /facts/{fid} body (docs/API.md). `text` is a new operator statement,
// required by the backend when certainty is raised; stored as review_edit.
export interface FactPatch {
  value?: string;
  normalized?: string;
  certainty?: Certainty;
  review_state: "operator_confirmed" | "operator_edited" | "operator_rejected";
  text?: string;
}

export interface HandoffDetail {
  id: string;
  state: HandoffState;
  outgoing: PersonRef;
  incoming: PersonRef;
  statements: Statement[];
  items: Item[];
  questions: Question[];
  not_asked: NotAsked[];
  budget: { used: number; max: number };
  followups: FollowUp[];
  status_line: StatusLine;
  // Verification checks with attempt history (ethnmz/hackutd2026#10, not merged).
  checks?: VerificationCheck[];
  // Shape not defined in docs/API.md yet.
  metrics: Record<string, unknown>;
}

// 409 from POST /handoffs/{id}/submit. Shape from ethnmz/hackutd2026#10 (not
// merged); `message` is display-ready. Plain strings are still accepted.
export interface Blocker {
  code: string;
  message: string;
  item_id?: string;
  fact_id?: string;
  question_id?: string;
}

// GET /handoffs list rows. docs/API.md says "list" without a row shape, so
// only the Handoff fields are relied on; the rest are shown when present.
export type HandoffSummary = Handoff & Partial<Pick<HandoffDetail, "outgoing" | "incoming" | "status_line">>;

export interface BriefingLine {
  text: string;
  item_id: string;
  fact_ids: string[];
  certainty: Certainty;
}

export interface Briefing {
  headline: string;
  lines: BriefingLine[];
  items: Item[];
  open_followups: FollowUp[];
  disclaimer: string;
}

export type Verdict = "consistent" | "partially_consistent" | "inconsistent";
export type CheckStatus = "pending" | "verified" | "needs_clarification" | "clarified_in_person";

// Shift B shapes from ethnmz/hackutd2026#10 (not merged yet). The answer key
// never reaches the client.
export interface CheckAttempt {
  statement_id: string;
  answer_text: string;
  verdict: Verdict;
  misconception: string | null;
  conveyed_fact_ids: string[];
  missing_fact_ids: string[];
  contradictions: { fact_id: string; claimed: string }[];
  feedback: string;
  evidence: Evidence[];
  at: string;
}

export interface Evidence {
  statement_id: string;
  quote: string;
  fact_id?: string;
}

export interface VerificationCheck {
  id: string;
  item_id: string;
  question: string;
  status: CheckStatus;
  attempts: CheckAttempt[];
}

// POST /handoffs/{id}/verification/start
export interface StartVerificationResponse {
  state: HandoffState;
  check: VerificationCheck;
}

// POST /verification/{vid}/answer. next_check is the same check while
// retrying, the next one when this one closes, or null.
export interface VerificationAttempt {
  check_id: string;
  attempt: number;
  verdict: Verdict;
  misconception: string | null;
  conveyed_fact_ids: string[];
  missing_fact_ids: string[];
  contradictions: { fact_id: string; claimed: string }[];
  feedback: string;
  evidence: Evidence[];
  status: CheckStatus;
  next_check: VerificationCheck | null;
  handoff_state?: HandoffState;
  answer_text?: string;
}
