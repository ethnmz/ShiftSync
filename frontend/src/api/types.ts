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
  owner: string | null;
  owner_label: string;
  deadline: string | null;
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
  // Shape not defined in docs/API.md yet.
  metrics: Record<string, unknown>;
}
