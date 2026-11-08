# AI pipeline

The model extracts, phrases questions, and proposes grades. Code decides status, which question is next, and whether signoff is allowed. Akshi owns prompts and schemas. A schema field change needs all four people.

Provider switch: `LLM_PROVIDER=claude|nemotron`, with an optional per-task override. The model id is an environment variable read at runtime. This spec does not name a model slug. Confirm the id against the provider's current docs when you build. Speech-to-text is `STT_PROVIDER=openai|local`. Photon does not transcribe.

## Call shape

Every call goes through `app/llm/client.py` `complete_json(task, system, user, schema)`.

1. Ask the configured provider for JSON matching the schema.
2. Validate with the schema.
3. On failure, retry once with the validation error appended.
4. On a second failure, raise. The caller stores the memo as `needs_review` and writes no facts. Never guess.

Log task, provider, latency, and ok or fail to `data/llm_log.jsonl`. Do not log API keys.

## Tasks

| Task | When | Output |
|---|---|---|
| `extract` | each note | `ExtractionResult` |
| `interview_question` | a critical gap was selected | `QuestionText` |
| `check_question` | a confirmed fact was selected | `QuestionText` |
| `grade` | an incoming answer arrived | `GradeResult` |

`interview/planner.py` chooses the gap before `interview_question` runs. `check/questions.py` chooses the fact before `check_question` runs. The model does not choose the slot.

## Schemas

```python
class FactCandidate(BaseModel):
    slot: SlotName
    status_guess: Literal["confirmed", "reported", "unknown"]
    text: str
    quote: str | None          # verbatim span, or null if the speaker did not say
    asset_mention: str | None

class ExtractionResult(BaseModel):
    kind: Literal["vendor_return", "equipment_condition", "restriction"]
    candidates: list[FactCandidate]

class QuestionText(BaseModel):
    text: str                  # one question, ≤ 30 words

class GradeResult(BaseModel):
    grade: Literal["aligned", "misunderstood", "not_mentioned"]
    evidence_quote: str | None
    correction: str | None     # required when grade is not aligned
```

`status_guess` is not stored. `facts/status.py` sets the stored status.

## Guardrails

1. Quote check: partial ratio ≥ 0.85 against the source transcript. Failure drops that candidate.
2. Hedge lexicon from `config/slots.yaml` forces `reported`. The lexicon file is not written yet. The starting words are: "I think", "should be fine", "probably", "maybe", "I guess".
3. Asset text is matched only to ids in configuration. No match leaves `asset_id` null.
4. `aligned` is stored only when `evidence_quote` verifies against the answer. Otherwise code stores `not_mentioned` if there is no quote, or `misunderstood` if the quote is present but the proposed grade was `aligned` and failed the check.
5. Owner and due time are parsed from the human answer by a pattern the ledger owns, or taken from an explicit web field. They are never model fields.

## Prompts to write when implementation starts

`backend/app/prompts/extract.md`, `interview.md`, `check.md`, `grade.md`. Copy the rules below. Do not add a prompt that asks the model for severity, an owner, a due time, or an equipment dependency.

Extract: record only what the note states. Hedged words stay hedged. A quote is an exact span or null. Do not infer that work finished.

Interview and check: ask the single slot you were given. Do not add a second question.

Grade: compare the answer with the confirmed fact text. If the answer says the work is done and the fact says it is not, grade `misunderstood` and write a correction that quotes the fact. If the answer never mentions the fact, grade `not_mentioned`.

## Not in this pipeline

There is no read-back-of-a-ledger prompt and no clarify-the-whole-shift prompt. Those were the earlier draft. Question text is one slot at a time.
