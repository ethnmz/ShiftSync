"""SQLModel tables. Mirrors docs/DATA_MODEL.md.

Enum-like fields are stored as plain strings; the allowed values are the
tuples below, and deterministic code validates against them.

Two internal columns are not in the API shapes:
- `Item.asset_mention`: the words used when no registry asset matched
  ("the cooling inspection"). Needed for priority and briefing.
- `ClarificationQuestion.target_slot`: the slot whose vague or uncertain value
  triggered the question. Lets gaps.py avoid re-asking about it.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

# ---------- Allowed values ----------
ROLES = ("tech", "lead", "supervisor", "vendor")
STATEMENT_SOURCES = ("voice_web", "text_web", "imessage_voice", "imessage_text", "seed")
STATEMENT_ROLES = ("handoff", "clarification_answer", "review_edit", "verification_answer", "followup_update")
ITEM_KINDS = ("maintenance", "vendor_work", "testing", "inspection", "bypass", "lockout_tagout",
              "decision", "warning", "general_claim", "observation")
WORK_STATUSES = ("complete", "incomplete", "pending", "not_started", "unknown")
CERTAINTIES = ("unknown", "unverified", "reported", "confirmed")  # lowest → highest
REVIEW_STATES = ("ai_extracted", "operator_confirmed", "operator_edited", "operator_rejected")
PRIORITIES = ("critical", "important", "routine")
HANDOFF_STATES = ("draft", "analyzing", "clarifying", "in_review", "submitted",
                  "acknowledged", "verifying", "verified", "verified_with_assistance")
GAP_TYPES = ("vague_statement", "missing_required", "uncertain_claim", "missing_rationale",
             "missing_condition", "unscoped_claim", "missing_owner_or_deadline")
VERDICTS = ("inconsistent", "partially_consistent", "consistent")  # worst → best
MISCONCEPTIONS = ("treated_incomplete_as_complete", "treated_unverified_as_confirmed", "assumed_clearance",
                  "missed_required_verification", "missed_rationale", "missed_condition", "wrong_owner",
                  "wrong_equipment", "other")
QUESTION_STATUSES = ("pending", "answered", "answered_unknown", "not_asked")
FOLLOWUP_STATUSES = ("open", "in_progress", "closed")
CHECK_STATUSES = ("pending", "verified", "needs_clarification", "clarified_in_person")


def _json_list() -> Any:
    return Field(default_factory=list, sa_column=Column(JSON))


def _json_dict() -> Any:
    return Field(default_factory=dict, sa_column=Column(JSON))


# ---------- Static (mirrored from config/*.yaml) ----------

class Person(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    role: str
    team: Optional[str] = None
    phone: Optional[str] = None


class Asset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    type: str
    location: Optional[str] = None
    aliases: list[str] = _json_list()


class Shift(SQLModel, table=True):
    id: str = Field(primary_key=True)
    team: str
    lead_id: Optional[str] = None
    starts_at: datetime
    ends_at: datetime


# ---------- Handoff ----------

class Handoff(SQLModel, table=True):
    id: str = Field(primary_key=True)
    from_shift_id: Optional[str] = None
    to_shift_id: Optional[str] = None
    outgoing_id: str
    incoming_id: str
    state: str = "draft"
    created_at: datetime
    submitted_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    verification_started_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    question_budget_used: int = 0
    metrics: dict[str, Any] = _json_dict()
    carried_over_item_ids: list[str] = _json_list()


class Statement(SQLModel, table=True):
    """Layer 1: verbatim source. Never updated after insert."""
    id: str = Field(primary_key=True)
    handoff_id: str = Field(index=True)
    speaker_id: str
    source: str
    role: str
    text: str
    audio_path: Optional[str] = None
    at: datetime
    question_id: Optional[str] = None


class Item(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: str = Field(index=True)
    origin_item_id: Optional[str] = None
    kind: str
    title: str
    asset_ids: list[str] = _json_list()
    asset_mention: Optional[str] = None
    location: Optional[str] = None
    priority: str = "routine"
    is_decision: bool = False
    open: bool = True
    created_from_statement_id: Optional[str] = None


class Fact(SQLModel, table=True):
    id: str = Field(primary_key=True)
    item_id: str = Field(index=True)
    slot: str
    value: str
    normalized: Optional[str] = None
    certainty: str
    certainty_reason: Optional[str] = None
    review_state: str = "ai_extracted"
    source_statement_id: Optional[str] = None
    quote: Optional[str] = None
    superseded_by: Optional[str] = None
    ai_proposed_value: Optional[str] = None


class FollowUp(SQLModel, table=True):
    id: str = Field(primary_key=True)
    item_id: str = Field(index=True)
    handoff_id: str = Field(index=True)
    description: str
    missing_information: str
    owner_id: Optional[str] = None
    deadline: Optional[datetime] = None
    assigned_by: Optional[str] = None
    assigned_at: Optional[datetime] = None
    status: str = "open"
    closed_by: Optional[str] = None
    closed_at: Optional[datetime] = None
    closure_statement_id: Optional[str] = None


class ClarificationQuestion(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: str = Field(index=True)
    item_id: str
    gap_type: str
    slots: list[str] = _json_list()
    target_slot: Optional[str] = None
    priority_score: int = 0
    text: str = ""
    why_asked: Optional[str] = None
    status: str = "pending"
    reason_not_asked: Optional[str] = None
    answer_statement_id: Optional[str] = None
    asked_at: Optional[datetime] = None
    answered_at: Optional[datetime] = None


class Acknowledgment(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: str = Field(index=True)
    person_id: str
    at: datetime
    scope: str = "handoff"
    item_id: Optional[str] = None


class VerificationCheck(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: str = Field(index=True)
    item_id: str
    question: str = ""
    answer_key: dict[str, Any] = _json_dict()
    status: str = "pending"
    attempts: list[dict[str, Any]] = _json_list()


class AuditEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: Optional[str] = None
    item_id: Optional[str] = None
    actor_id: Optional[str] = None
    type: str
    at: datetime
    detail: dict[str, Any] = _json_dict()
