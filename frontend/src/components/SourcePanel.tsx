import { useEffect, useRef, type ReactNode } from "react";
import type { Fact, Question, Statement, StatementRole } from "../api/types";
import { formatClock } from "../labels";
import { person } from "../session/roster";

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

type Span = { start: number; end: number; kind: "term" | "quote"; cls?: string; label?: string };

function spansFor(text: string, terms: { term: string; kind: string }[], quote: string | null): Span[] {
  const lower = text.toLowerCase();
  const spans: Span[] = [];
  if (quote) {
    const q = quote.toLowerCase().replace(/[.,]+$/, "");
    const at = lower.indexOf(q);
    if (at >= 0) spans.push({ start: at, end: at + q.length, kind: "quote" });
  }
  for (const t of terms) {
    const at = lower.indexOf(t.term.toLowerCase());
    if (at < 0) continue;
    const overlaps = spans.some((s) => at < s.end && at + t.term.length > s.start && s.kind === "term");
    if (!overlaps) spans.push({ start: at, end: at + t.term.length, kind: "term", ...REASON[t.kind] });
  }
  return spans.sort((a, b) => a.start - b.start || (a.kind === "quote" ? -1 : 1));
}

// Renders text with the selected quote as <mark> and flagged terms underlined.
function render(text: string, spans: Span[]): ReactNode[] {
  const quote = spans.find((s) => s.kind === "quote");
  const terms = spans.filter((s) => s.kind === "term");
  const cuts = new Set([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    let node: ReactNode = text.slice(a, b);
    const term = terms.find((t) => a >= t.start && b <= t.end);
    if (term) node = <span title={term.label} className={`underline decoration-2 underline-offset-4 ${term.cls}`}>{node}</span>;
    if (quote && a >= quote.start && b <= quote.end) node = <mark>{node}</mark>;
    out.push(<span key={a}>{node}</span>);
  }
  return out;
}

export default function SourcePanel({
  statements,
  facts,
  questions = [],
  selectedFact,
  title = "Source transcript",
  empty,
}: {
  statements: Statement[];
  facts: Fact[];
  questions?: Question[];
  selectedFact: Fact | null;
  title?: string;
  empty?: ReactNode;
}) {
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedFact?.id]);

  const termsBy = new Map<string, { term: string; kind: string }[]>();
  for (const f of facts) {
    const m = /^(\w+):"(.+)"$/.exec(f.certainty_reason);
    if (!m || !REASON[m[1]]) continue;
    termsBy.set(f.source_statement_id, [...(termsBy.get(f.source_statement_id) ?? []), { kind: m[1], term: m[2] }]);
  }

  return (
    <section aria-labelledby="source-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="source-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        {selectedFact && <span className="text-xs text-faint">Highlighting the selected fact</span>}
      </div>
      {statements.length === 0 ? (
        empty ?? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {statements.map((s) => {
            const isSource = selectedFact?.source_statement_id === s.id;
            const q = s.question_id ? questions.find((x) => x.id === s.question_id) : null;
            return (
              <li
                key={s.id}
                ref={isSource ? selectedRef : undefined}
                className={`rounded-lg border bg-surface p-3 text-sm transition-colors ${isSource ? "border-warn/60 ring-2 ring-warn/20" : "border-line"}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{person(s.speaker_id)?.name ?? s.speaker_id}</span>
                  <span>· {ROLE_LABEL[s.role]}</span>
                  {/* Statement.at is a wall-clock timestamp, not an audio offset. */}
                  <time dateTime={s.at} className="ml-auto tabular-nums">
                    {formatClock(s.at)}
                  </time>
                </div>
                {q && <p className="mb-1 text-xs italic text-faint">Q: {q.text}</p>}
                <p className="leading-relaxed">{render(s.text, spansFor(s.text, termsBy.get(s.id) ?? [], isSource ? selectedFact!.quote : null))}</p>
                {isSource && !s.text.toLowerCase().includes(selectedFact!.quote.toLowerCase().replace(/[.,]+$/, "")) && (
                  <p className="mt-2 border-l-2 border-warn pl-2 text-xs italic text-muted">Quoted: “{selectedFact!.quote}”</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-faint">
        <span className="underline decoration-warn decoration-2 underline-offset-2">hedged</span> ·{" "}
        <span className="underline decoration-unk decoration-2 underline-offset-2">uncertain</span> ·{" "}
        <span className="underline decoration-info decoration-2 underline-offset-2">observation</span>
      </p>
    </section>
  );
}
