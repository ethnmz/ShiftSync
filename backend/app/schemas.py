"""Validated model output for handoff clarification, briefing and verification."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClarificationText(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    text: str = Field(min_length=1)
    why_asked: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def check_question(cls, value: str) -> str:
        if len(value.split()) > 30 or value.count("?") != 1 or not value.endswith("?"):
            raise ValueError("Ask one question in at most 30 words, ending with a question mark.")
        return value

    @field_validator("why_asked")
    @classmethod
    def check_reason(cls, value: str) -> str:
        if len(value.split()) > 10:
            raise ValueError("Explain the reason in at most 10 words.")
        return value


class Contradiction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    fact_id: str = Field(min_length=1)
    claimed: str = Field(min_length=1)


class BriefingLine(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    text: str = Field(min_length=1)
    item_id: str = Field(min_length=1)
    fact_ids: list[str]

    @field_validator("text")
    @classmethod
    def limit_line(cls, value: str) -> str:
        if len(value.split()) > 22:
            raise ValueError("Use at most 22 words per briefing line.")
        return value


class BriefingText(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    headline: str = Field(min_length=1)
    lines: list[BriefingLine] = Field(max_length=6)

    @field_validator("headline")
    @classmethod
    def limit_headline(cls, value: str) -> str:
        if len(value.split()) > 25:
            raise ValueError("Use at most 25 words in the briefing headline.")
        return value


class GradeResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    conveyed_fact_ids: list[str]
    missing_fact_ids: list[str]
    contradictions: list[Contradiction]
    misconception: Literal[
        "treated_incomplete_as_complete", "treated_unverified_as_confirmed", "assumed_clearance",
        "missed_required_verification", "missed_rationale", "missed_condition", "wrong_owner",
        "wrong_equipment", "other",
    ] | None
    verdict: Literal["consistent", "partially_consistent", "inconsistent"]
    feedback: str | None

    @field_validator("feedback")
    @classmethod
    def limit_feedback(cls, value: str | None) -> str | None:
        if value is not None and len(value.split()) > 50:
            raise ValueError("Keep feedback to 50 words or fewer.")
        return value
