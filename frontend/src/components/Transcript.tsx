import { useEffect, useRef, type ReactNode } from "react";
import type { Fact, Item, Question, Statement, StatementRole } from "../api/types";
import { formatClock } from "../labels";
import { person } from "../session/roster";
import AudioBubble from "./AudioBubble";

const ROLE_LABEL: Record<StatementRole, string> = {
  handoff: "Handoff note",
  clarification_answer: "Answer",
  review_edit: "Review edit",
  verification_answer: "Check answer",
  followup_update: "Follow-up update",
};

// certainty_reason prefixes (docs/DATA_MODEL.md; observation confirmed on the board).
const REASON: Record<string, { cls: string; label: string }> = {
  hedge: { cls: "decoration-warn", label: "Hedged, so capped at Unverified" },
  uncertainty: { cls: "decoration-unk", label: "Uncertain, so Unknown" },
  observation: { cls: "decoration-info", label: "Observation, so capped at Reported" },
};
const FOCUS = { cls: "decoration-accent", label: "ShiftSync is asking about this" };

type Span = { start: number; end: number; kind: "quote" | "term" | "focus"; factId?: string; cls?: string; label?: string };

const clean = (s: string) => s.toLowerCase().replace(/[.,]+$/, "");

function spansFor(text: string, facts: Fact[], focus: Set<string>, selected: Fact | null): Span[] {
  const lower = text.toLowerCase();
  const spans: Span[] = [];
  if (selected) {
    const at = lower.indexOf(clean(selected.quote));
    if (at >= 0) spans.push({ start: at, end: at + clean(selected.quote).length, kind: "quote", factId: selected.id });
  }
  for (const f of facts) {
    // Flagged wording: the hedge/uncertainty/observation term that set the certainty floor.
    const m = /^(\w+):"(.+)"$/.exec(f.certainty_reason);
    if (m && REASON[m[1]]) {
      const at = lower.indexOf(m[2].toLowerCase());
      if (at >= 0 && !spans.some((s) => s.kind === "term" && at < s.end && at + m[2].length > s.start))
        spans.push({ start: at, end: at + m[2].length, kind: "term", factId: f.id, ...REASON[m[1]] });
    }
    // Lines behind the question being asked right now.
    if (focus.has(f.id)) {
      const at = lower.indexOf(clean(f.quote));
      if (at >= 0) spans.push({ start: at, end: at + clean(f.quote).length, kind: "focus", factId: f.id, ...FOCUS });
    }
  }
  return spans;
}

// Text with the selected quote marked and flagged lines underlined. Underlined
// parts are buttons that select the fact they came from.
function render(text: string, spans: Span[], onSelect?: (factId: string) => void): ReactNode[] {
  const cuts = new Set([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const inside = (k: Span["kind"]) => spans.find((s) => s.kind === k && a >= s.start && b <= s.end);
    const term = inside("term");
    const focus = inside("focus");
    const quote = inside("quote");
    const line = term ?? focus;
    let node: ReactNode = text.slice(a, b);
    if (line) {
      const cls = `underline decoration-2 underline-offset-[6px] ${line.cls}`;
      // Buttons trim their edge spaces, so keep those spaces outside.
      const [, lead, core, trail] = /^(\s*)(.*?)(\s*)$/s.exec(text.slice(a, b))!;
      const inner =
        onSelect && line.factId ? (
          <button type="button" title={line.label} onClick={() => onSelect(line.factId!)} className={`${cls} rounded-sm text-left hover:bg-subtle`}>
            {core}
          </button>
        ) : (
          <span title={line.label} className={cls}>
            {core}
          </span>
        );
      node = (
        <>
          {lead}
          {inner}
          {trail}
        </>
      );
    }
    if (quote) node = <mark className="rounded-sm bg-warn/20 text-ink">{node}</mark>;
    out.push(<span key={a}>{node}</span>);
  }
  return out;
}

const initial = (id: string) => (person(id)?.name ?? id).slice(0, 1).toUpperCase();

// Equipment and speaker share, like a meeting header. Speaker share counts words.
export function TranscriptHeader({ statements, items, asking = false }: { statements: Statement[]; items: Item[]; asking?: boolean }) {
  const assets = [...new Set(items.flatMap((i) => i.asset_ids))];
  const words = new Map<string, number>();
  for (const s of statements) words.set(s.speaker_id, (words.get(s.speaker_id) ?? 0) + s.text.split(/\s+/).filter(Boolean).length);
  const total = [...words.values()].reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold">Equipment</h3>
        <p className="mt-1 text-muted">{assets.length ? assets.join(", ") : "None named yet"}</p>
      </div>
      <div>
        <h3 className="font-semibold">Speakers</h3>
        <p className="mt-1 text-muted">
          {[...words.entries()].map(([id, n]) => `${person(id)?.name ?? id} (${Math.round((n / total) * 100)}%)`).join(", ") || "Nobody yet"}
        </p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {asking && <span className="underline decoration-accent decoration-2 underline-offset-4">being asked about</span>}
        <span className="underline decoration-warn decoration-2 underline-offset-4">hedged</span>
        <span className="underline decoration-unk decoration-2 underline-offset-4">uncertain</span>
        <span className="underline decoration-info decoration-2 underline-offset-4">observation</span>
      </p>
    </div>
  );
}

// The handoff as a transcript: one block per statement with speaker, time and
// flagged lines underlined. Statements are verbatim (source layer, never edited).
export default function Transcript({
  statements,
  facts,
  questions = [],
  focusFactIds = new Set(),
  selectedFact = null,
  onSelectFact,
  audioFor,
}: {
  statements: Statement[];
  facts: Fact[];
  questions?: Question[];
  focusFactIds?: Set<string>;
  selectedFact?: Fact | null;
  onSelectFact?: (factId: string) => void;
  audioFor?: (s: Statement) => { src: string; peaks?: number[] } | null;
}) {
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedFact?.id]);

  if (statements.length === 0) return <p className="rounded-xl border border-dashed border-line p-5 text-muted">Nothing recorded yet.</p>;

  return (
    <ol className="flex flex-col gap-8">
      {statements.map((s) => {
        const isSource = selectedFact?.source_statement_id === s.id;
        const q = s.question_id ? questions.find((x) => x.id === s.question_id) : null;
        const own = facts.filter((f) => f.source_statement_id === s.id);
        const audio = audioFor?.(s);
        return (
          <li key={s.id} ref={isSource ? selectedRef : undefined} className="flex gap-4">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
              {initial(s.speaker_id)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold">{person(s.speaker_id)?.name ?? s.speaker_id}</span>
                {/* Statement.at is a wall-clock timestamp, not an audio offset. */}
                <time dateTime={s.at} className="text-sm tabular-nums text-muted">
                  {formatClock(s.at)}
                </time>
                <span className="text-sm text-faint">{ROLE_LABEL[s.role]}</span>
              </div>
              {q && <p className="mt-1 text-sm text-muted">Answering: {q.text}</p>}
              {audio && (
                <div className="mt-2 max-w-sm">
                  <AudioBubble src={audio.src} peaks={audio.peaks} label="this statement" />
                </div>
              )}
              <p className="mt-2 text-lg leading-[1.9]">{render(s.text, spansFor(s.text, own, focusFactIds, isSource ? selectedFact : null), onSelectFact)}</p>
              {isSource && !s.text.toLowerCase().includes(clean(selectedFact!.quote)) && (
                <p className="mt-2 border-l-2 border-warn pl-3 text-sm text-muted">Quoted: “{selectedFact!.quote}”</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
