# AI Pipeline

Five LLM tasks. Everything else is deterministic code.

| task | when | input | output schema |
|---|---|---|---|
| `extract` | every memo | transcript, asset registry, open items, roster | `ExtractionResult` |
| `clarify` | handoff start | open items + this shift's memos + their ambiguities | `ClarificationSet` |
| `brief` | briefing build | open items (structured) | `BriefingText` |
| `readback` | read-back submitted | read-back transcript + open critical/warning items | `ReadbackResult` |
| `ask` | Q&A drawer | question + full ledger + recent memos | `AskResult` |

## 1. Provider abstraction (`app/llm/`)

```python
# app/llm/client.py
async def complete_json(task: str, system: str, user: str, schema: type[BaseModel]) -> BaseModel:
    provider = settings.provider_for(task)   # LLM_PROVIDER_<TASK> or LLM_PROVIDER
    raw = await PROVIDERS[provider].complete(system, user, schema.model_json_schema())
    try:
        return schema.model_validate_json(extract_json(raw))
    except ValidationError as e:
        raw = await PROVIDERS[provider].complete(system, user + f"\n\nYour previous output was invalid: {e}. Return ONLY valid JSON.", ...)
        return schema.model_validate_json(extract_json(raw))   # raise → caller falls back
```

- **ClaudeProvider**: `anthropic.AsyncAnthropic`. Most reliable: force a single tool whose `input_schema` is the Pydantic JSON schema (`tool_choice={"type":"tool","name":"emit"}`) and read `tool_use.input`. Model from `CLAUDE_MODEL` (default `claude-sonnet-5-5`; `claude-haiku-5-5` is fine for `extract` if latency matters).
- **NemotronProvider**: `openai.AsyncOpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=NVIDIA_API_KEY)`. Model from `NEMOTRON_MODEL` (confirm the exact slug on the model card at build.nvidia.com, e.g. the Nemotron 3.5 Lightning or Nemotron 3 Ultra pages). Put the JSON schema in the system prompt, `temperature=0`, then parse the first `{...}` block. If the model emits reasoning/think text, strip it before parsing.
- `extract_json(raw)`: strip code fences and `<think>…</think>`, take the outermost JSON object.
- Log every call (task, provider, latency, ok/fail) to `data/llm_log.jsonl`. Handy for the demo "show your work" panel and for debugging.

**Nvidia track tip:** set `LLM_PROVIDER=nemotron` for the final demo if both providers pass `test_scenario.py`. The multi-step pipeline (extract → reconcile → rules → clarify → read-back) plus the P2 tool-using investigator agent covers their "multi-step workflows" and "tool integration" requirements.

## 2. Guardrails (code, not prompts)
1. **Quote verification**: `verify_quote(quote, transcript)` uses `rapidfuzz.fuzz.partial_ratio` ≥ 85. Fail → drop the observation, log it.
2. **Asset validation**: `asset_id` must exist in `assets.yaml`. Otherwise try alias match (`rapidfuzz` over aliases, ≥ 90). Still none → `asset_id=null` + add an `ambiguous_asset` ambiguity.
3. **Closure validation**: an item resolves only when `action ∈ CLOSING_ACTIONS` AND the quote verifies AND the observation links to that item (or there's exactly one open item of the matching kind on that asset).
4. **No severity from the LLM**: the schema has no severity field. `rules.py` sets it.
5. **Read-back bias**: in doubt, the grader must choose `missed`. A false "missed" costs one tap; a false "covered" could cost an outage.

## 3. Schemas (`app/schemas.py`)

```python
class Observation(BaseModel):
    asset_mention: str                    # words used in the memo, e.g. "breaker 4"
    asset_id: str | None                  # from registry, or null if unsure
    action: Action                        # enum in DATA_MODEL.md
    kind_hint: ItemKind                   # what kind of ledger item this relates to
    vendor: str | None = None
    person_mentioned: str | None = None   # e.g. tag holder "Dave Smith"
    state_detail: str                     # ≤ 15 words, plain language
    reading: str | None = None            # e.g. "25.5 °C cold aisle"
    contingency: str | None = None        # only if the speaker stated one
    directive: DirectiveScope | None = None
    link_item_id: str | None = None       # existing open item this updates, if any
    quote: str                            # VERBATIM span from transcript supporting this
    ambiguities: list[Ambiguity] = []

class DirectiveScope(BaseModel):
    hall: str | None
    asset_ids: list[str] = []
    categories: list[Literal["heavy_load","electrical_work","cooling_work","any_work"]]
    until: str | None                     # free text, e.g. "further notice"

class Ambiguity(BaseModel):
    type: Literal["ambiguous_asset","ambiguous_vendor","unclear_status","missing_closure","unclear_time"]
    question: str                         # the question we'd ask the author
    about_item_id: str | None = None

class ExtractionResult(BaseModel):
    is_relevant: bool                     # false for pure chit-chat
    observations: list[Observation]
    chit_chat_ignored: list[str] = []     # e.g. ["coffee machine broken", "badge reader sticking"]

class ClarificationQ(BaseModel):
    ask_to: str                           # person id
    about_item_id: str | None
    about_memo_id: str
    question: str                         # ≤ 30 words, answerable in one sentence
    reason: Literal["ambiguous_asset","ambiguous_vendor","unclear_status","missing_closure","rule"]
class ClarificationSet(BaseModel):
    questions: list[ClarificationQ]

class BriefingLine(BaseModel):
    item_id: str
    one_liner: str                        # ≤ 18 words, starts with the equipment name
    action: str | None                    # imperative, what incoming shift must do/not do
class BriefingText(BaseModel):
    headline: str                         # ≤ 30 words
    lines: list[BriefingLine]

class ReadbackVerdict(BaseModel):
    item_id: str
    verdict: Literal["covered","missed","misstated"]
    evidence_quote: str | None            # verbatim from read-back if covered/misstated
    issue: str | None                     # for misstated: what's wrong
class ReadbackResult(BaseModel):
    verdicts: list[ReadbackVerdict]       # exactly one per item provided

class AskResult(BaseModel):
    answer: str
    citations: list[dict]                 # [{memo_id, quote}]
    confidence: Literal["high","medium","low"]
```

## 4. Prompts (copy into `backend/app/prompts/*.md`)

### 4.1 `extract.md`, system
```
You are the intake clerk for a data center shift-handoff ledger. Technicians send short,
informal voice-note transcripts while working. Your job is to turn ONE memo into structured
observations about equipment state. You never judge severity; rules do that.

Rules:
- Only record facts the memo actually states. Never infer that something was fixed,
  restored or removed unless the memo says so explicitly.
- Every observation MUST include `quote`: an exact, contiguous span copied from the
  transcript (5–25 words) that supports it. Do not paraphrase inside `quote`.
- Map equipment to `asset_id` using the ASSET REGISTRY (ids, names, aliases). If the memo
  is vague ("the breaker", "the vendor", "it"), use context from OPEN ITEMS only when
  there is exactly one plausible match; otherwise set asset_id null AND add an ambiguity
  with a short question for the author.
- If the memo updates an existing open item, set `link_item_id`.
- Choose `action` from the allowed list. Use test_started / work_started / energize /
  load_increase when someone is BEGINNING an activity now.
- "Left it in bypass", "still bypassed", "tag's still on" are updates, NOT closures.
- Directives from leads ("no load tests in Hall C until further notice") → action
  directive_issued, kind_hint directive, fill `directive`.
- Ignore chit-chat (coffee machines, lunch, badge readers unless security-relevant), but
  list it in chit_chat_ignored so we can show we read everything.
- Add an ambiguity whenever status is unclear (e.g. "the vendor left early": did they
  remove their lockout? which vendor?).
Return ONLY JSON matching the schema.
```
User template:
```
ASSET REGISTRY:
{assets_compact}            # "BRK-4 | Breaker 4 | breaker | Hall B | aliases: breaker four, bkr 4 | feeds: UPS-B"

OPEN ITEMS:
{open_items_compact}        # "L-0003 | lockout_tagout | BRK-4 | Siemens | tag holder Dave Smith | 'Paused...'"

ROSTER: {roster_compact}
MEMO {memo_id} from {author_name} ({role}) at {local_time}:
"""{transcript}"""

JSON SCHEMA:
{schema}
```

### 4.2 `clarify.md`, system
```
You are the outgoing-shift quality check. Before the outgoing shift leaves, find anything in
their memos that the incoming shift could misunderstand, and write short questions for the
person who wrote the memo. Prioritize safety: lockouts, bypasses, vendor work, anything
that might be energized, tested or restored by the next shift.

Ask about:
- vague references (which vendor? which breaker?)
- unclear status (is the lockout still on? is it still bypassed? running in auto or manual?)
- work that started but has no completion or pause recorded
- the RULE FLAGS provided (already detected by code; turn each into a natural question)
Do NOT ask about chit-chat or things already answered in a later memo.
Max 5 questions. Each ≤ 30 words, answerable in one sentence, and quote the person's own
words so they remember (e.g. 'In your 03:15 note you said "the vendor left early"...').
Return ONLY JSON.
```

### 4.3 `brief.md`, system
```
Write the incoming shift's 60-second briefing lines. You receive ledger items that are
already prioritized by severity; keep their order. For each item write a one_liner
(≤ 18 words, starts with equipment name, states current state plainly) and, if the incoming
shift must do or avoid something, an imperative `action`. Write a ≤ 30-word headline
summarizing critical items. Use only facts in the items. No new facts, no softening.
Return ONLY JSON.
```

### 4.4 `readback.md`, system
```
You are checking a handoff read-back. The incoming shift lead has summarized, in their own
words, what they were handed. For EACH ledger item provided, decide:
- covered: the read-back clearly refers to this item AND its key safety state
  (e.g. mentions breaker 4 / UPS-B lockout, not just "UPS stuff").
- misstated: the item is referenced but a key fact is wrong (e.g. says "lockout removed"
  when it is still on, or wrong equipment).
- missed: not mentioned, or only so vaguely that it can't be confirmed.
When in doubt, choose missed. A false "covered" is dangerous; a false "missed" only costs
a confirmation tap. evidence_quote must be verbatim from the read-back.
Return exactly one verdict per item. Return ONLY JSON.
```

### 4.5 `ask.md`, system
```
Answer questions about the facility state using ONLY the ledger items and memos provided.
Cite memo ids and short verbatim quotes. If the answer isn't in the data, say
"That isn't in the logs" and suggest who to ask (the memo author or shift lead).
Prefer current state over history; mention if something changed over time.
Return ONLY JSON.
```

## 5. Speech-to-text (`app/stt/`)
- `transcribe(path) -> str`. First `ffmpeg -y -i in -ac 1 -ar 16000 out.wav` (iMessage voice notes are often `audio/x-caf` / `.caf`, which most STT APIs reject).
- `STT_PROVIDER=openai`: `client.audio.transcriptions.create(model=OPENAI_STT_MODEL, file=...)` with a `prompt` containing asset names and aliases ("UPS B, Breaker 4, CRAC 3, Chiller 2, LOTO, Siemens…") to improve jargon accuracy.
- `STT_PROVIDER=local`: `faster-whisper` `small.en` on CPU (`compute_type="int8"`), with the same jargon list as `initial_prompt`. Load the model once at startup.

## 6. Evaluation loop
`pytest backend/tests/test_scenario.py -k extract` runs each scenario memo through `extract` + reconcile and compares with `expect`. Tune prompts until it passes on **both** providers. Keep a changelog of prompt edits in `backend/app/prompts/CHANGELOG.md`.
