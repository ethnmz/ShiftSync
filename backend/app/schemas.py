"""Validated model output consumed by the verification grader."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Contradiction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    fact_id: str = Field(min_length=1)
    claimed: str = Field(min_length=1)


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
