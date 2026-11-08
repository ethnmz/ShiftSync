# AI Pipeline

AI is used for transcription, extraction, ambiguity detection, clarification questions, rationale extraction, uncertainty classification, briefing and understanding verification. **Code decides** gaps, priority, question order and budget, certainty floors, verdict floors, states, follow-up creation and ownership. Provider names are `nemotron` and `claude`. Do not copy a model slug into this doc. `.env.example` leaves the model id blank until it is confirmed.

| task | Problem(s) | input | output schema |
|---|---|---|---|
| `extract` | 1, 3, 4, 5 | statement + assets + existing items/facts + slot catalog | `ExtractionResult` |
| `clarify` | 1, 3, 4, 5 | the chosen gap (from code) + item facts + Shift A's words | `ClarificationText` |
| `brief` | 2 | operator-reviewed items (ordered by code) | `BriefingText` |
| `verify_question` | 2 | item + answer key | `VerificationQuestionText` |
| `grade` | 2 | question + answer key + Shift B's answer | `GradeResult` |
| `eval_summary`, `eval_reader` | evaluation | see `EVALUATION.md` | |

## 1. Providers (`app/llm/`)
```python
async def complete_json(task, system, user, schema) -> BaseModel:
    provider = settings.provider_for(task)           # LLM_PROVIDER_<TASK> or LLM_PROVIDER (default nemotron)
    raw = await PROVIDERS[provider].complete(system, user, schema.model_json_schema())
    try: return schema.model_validate_json(extract_json(raw))
    except ValidationError as e:                     # 1 retry with the error, then raise → caller makes NO state change
        raw = await PROVIDERS[provider].complete(system, user + f"\n\nInvalid output: {e}. Return ONLY valid JSON.", ...)
        return schema.model_validate_json(extract_json(raw))
```
- **Nemotron (default)**: `openai.AsyncOpenAI(base_url=NVIDIA_BASE_URL, api_key=NVIDIA_API_KEY)`, `NEMOTRON_MODEL` (confirm the slug on build.nvidia.com), `temperature=0`, JSON schema in the system prompt, strip `<think>…</think>` and code fences, then parse the outermost `{…}`. If the model supports a JSON/guided-output parameter on the endpoint, use it.
- **Claude (fallback)**: `anthropic.AsyncAnthropic`, forced tool call with the schema as `input_schema`. `CLAUDE_MODEL=claude-sonnet-5-5`.
- Target < 4 s per call so clarification feels conversational. Log every call to `data/llm_log.jsonl`.

## 2. Guardrails (code, `app/certainty/` and `app/verify/floor.py`)
1. **Extractor quote verification**: Require 3–30 words. An invalid length triggers model-output validation and one retry. For a valid-length quote, require an exact, case-sensitive, contiguous match in the source statement so the UI can highlight the operator's words. Drop and log facts whose quotes do not match.
2. **Certainty floor**: lexicons in `slots.yaml → language`: `uncertainty_terms` → `unknown`; `hedges` → max `unverified`; `observation_terms` → max `reported`. Only lowers. Logged as `certainty_floored` with the triggering term (shown in the UI: *"unverified: 'mostly'"*).
3. **Vague flag**: a quote containing `vague_terms` can't satisfy a safety slot by itself → `vague_statement` gap.
4. **No invented owners/deadlines/clearance/completion**: owner must be a roster person or role named in the quote ("Shift B lead" → incoming lead); deadline must be derivable from time words in the quote; `operational_clearance=cleared` and `work_status=complete` require an explicit statement (never inferred from "vendor coming back", "looks good"…). Otherwise null → follow-up "To be assigned".
5. **Verdict floor**: any contradiction of a critical fact → `inconsistent`; any missing critical fact → max `partially_consistent`.
6. **Forbidden language**: `rules.yaml → language_rules`. Post-check briefing/feedback text; if it says "cleared/safe/complete" about an item whose facts don't confirm it, regenerate once, else fall back to a template.

## 3. Schemas (`app/schemas.py`)
```python
class FactOut(BaseModel):
    slot: str                        # from SLOT CATALOG for the kind
    value: str                       # ≤ 15 words
    normalized: str | None = None
    certainty: Literal["confirmed","reported","unverified","unknown"]
    quote: str                       # VERBATIM, contiguous, 3–30 words
    owner_mentioned: str | None = None      # only if explicitly said
    deadline_text: str | None = None        # only exact time words said

class ItemOut(BaseModel):
    link_item_id: str | None
    kind: ItemKind
    asset_mention: str | None        # words used ("the cooling inspection")
    asset_id: str | None             # registry id or null if unclear
    title: str                       # ≤ 8 words
    is_decision: bool
    facts: list[FactOut]

class ExtractionResult(BaseModel):
    items: list[ItemOut]
    unscoped_claims: list[str] = []  # e.g. "everything else should be okay"

class ClarificationText(BaseModel):
    text: str                        # ≤ 30 words, one question (max two linked parts)
    why_asked: str                   # ≤ 10 words, shown as a tag, e.g. '"mostly finished": what remains?'

class BriefingText(BaseModel):
    headline: str                    # ≤ 25 words
    lines: list[dict]                # [{text ≤ 22 words, item_id, fact_ids}], ≤ 6, code's order kept

class VerificationQuestionText(BaseModel):
    text: str                        # open-ended, ≤ 25 words, starts What/Why/Who/How/Before

class GradeResult(BaseModel):
    conveyed_fact_ids: list[str]
    missing_fact_ids: list[str]
    contradictions: list[dict]       # [{fact_id, claimed}]
    misconception: Misconception | None
    verdict: Literal["consistent","partially_consistent","inconsistent"]
    feedback: str | None             # ≤ 50 words, neutral; cites the handoff; no operational authorization
```

## 4. Prompts (copy into `backend/app/prompts/*.md`)

### `extract.md`
```
You convert a data center operator's spoken shift handoff into structured items and facts.
Record exactly what was said and HOW CERTAIN it was. Never add information.

Certainty:
- confirmed: stated as first-hand, verified fact with no hedging ("it's still in bypass").
- reported: an observation or second-hand claim, not a verification ("looks good", "vendor said").
- unverified: a specific claim that is hedged or explicitly not verified ("I think they finished",
  "mostly finished", "should be done", "haven't received confirmation").
- unknown: the speaker doesn't know the state ("not sure what happened").

Rules:
- Never infer completion, clearance, owners or deadlines. "The vendor is coming back tomorrow"
  says nothing about clearance. "Mostly finished" means work_status=incomplete with certainty
  unverified, never complete.
- Capture decisions (postponed, deferred, kept in bypass…) with is_decision=true, plus their
  rationale, conditions, restrictions and exceptions when stated.
- Use only slot names from the SLOT CATALOG for each kind.
- Every fact needs `quote`: an exact contiguous span from the statement.
- Map equipment with the ASSET REGISTRY; if the speaker is vague ("the cooling inspection"), set
  asset_id null and keep asset_mention.
- Link to EXISTING ITEMS when the statement refers to them (link_item_id); answers to a
  clarification question (SCOPE given) mostly update that item.
- Put catch-alls with no named equipment ("everything else should be okay") in unscoped_claims.
Return ONLY JSON matching the schema.
```
User template: `ASSET REGISTRY`, `SLOT CATALOG`, `EXISTING ITEMS (+facts)`, `ROSTER`, `SPEAKER (role)`, optional `SCOPE: answering question "{q}" about item {id}, slots {slots}`, `STATEMENT`.

### `clarify.md`
```
You are ShiftSync helping a tired outgoing operator finish a handoff. Code has already chosen the
GAP to ask about. Phrase ONE short, specific question (≤ 30 words, plain speech, no greeting).
- Quote the operator's own words when clarifying vague or uncertain language
  ('You said "mostly finished"…').
- Ask for the concrete operational fact: what remains, why, whether it's cleared for normal
  operation, whether it's been confirmed, who confirmed it.
- If two slots are given, ask both in one natural sentence.
- Never suggest an answer, never imply something is complete or safe.
Also return why_asked (≤ 10 words) for the UI tag. Return ONLY JSON.
```

### `brief.md`
```
Write the incoming operator's briefing from REVIEWED ITEMS (already in priority order; keep it).
≤ 6 lines, ≤ 22 words each. For each critical item state: current status, what remains, why, what
must be verified and by whom, owner/deadline or "owner to be assigned". Keep certainty explicit
("unverified", "unknown", "reported"). Never call anything cleared, safe, complete or resolved
unless a fact says so with certainty confirmed. No new facts. Return ONLY JSON.
```

### `verify_question.md`
```
Write ONE open-ended question that checks whether the incoming operator understood this item:
its status, what remains or must be verified before testing/normal operation, why, and who owns
the follow-up. Must not be answerable with yes/no. Must not reveal the answer. ≤ 25 words.
Return ONLY JSON.
```

### `grade.md`
```
Compare the incoming operator's ANSWER with the ANSWER KEY from the outgoing operator's reviewed
handoff.
- conveyed: the answer states the fact's meaning (any wording).
- missing: not stated.
- contradiction: the answer claims something the key contradicts or lists in must_not_claim
  (e.g. "maintenance is complete" when it is incomplete; "it's cleared" when clearance is
  unconfirmed; treating an unverified claim as confirmed).
Pick the single most important misconception.
Verdict: inconsistent if any contradiction; partially_consistent if no contradiction but a key fact
is missing; consistent otherwise. If unsure, mark the fact missing.
If not consistent, write feedback (≤ 50 words): say plainly that the interpretation is inconsistent
with the handoff, state the correct facts with their certainty, and if clearance is involved say it
"must be verified through authorized procedures". Never authorize any operation.
Example: "That interpretation is inconsistent with the handoff. Maintenance remains incomplete,
and clearance must be verified through authorized procedures."
Return ONLY JSON.
```
Code attaches `evidence` (the source quotes of the contradicted/missing facts) to the feedback; the LLM doesn't produce quotes here.

## 5. Speech-to-text (`app/stt/`)
Browser records `audio/webm` (iMessage voice notes are `.caf`). Run `ffmpeg -y -i in -ac 1 -ar 16000 out.wav` → `STT_PROVIDER=openai` (`audio.transcriptions.create(model=OPENAI_STT_MODEL, prompt=JARGON)`) or `local` (`faster-whisper small.en`, `initial_prompt=JARGON`). JARGON = asset names and aliases + "UPS, maintenance bypass, load test, chiller, CRAC, LOTO, vendor, clearance".

## 6. Prompt tuning loop
`pytest tests/test_demo_scenario.py` (expected behavior of the demo) and `python -m app.eval.run` (benchmark). Tune on `demo/`, report on `eval/`. Log prompt changes in `backend/app/prompts/CHANGELOG.md`.
