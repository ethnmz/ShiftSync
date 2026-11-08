import type { Fact, Statement } from "../api/types";

// The backend records why it lowered certainty in Fact.certainty_reason, e.g.
// hedge:"mostly" (docs/DATA_MODEL.md). We underline those exact terms instead of
// keeping a second copy of the lexicon from config/slots.yaml.
const REASON_STYLE: Record<string, { cls: string; label: string }> = {
  hedge: { cls: "decoration-amber-500", label: "Hedged: capped at Unverified" },
  uncertainty: { cls: "decoration-violet-500", label: "Uncertain: Unknown" },
  observation: { cls: "decoration-blue-500", label: "Observation: capped at Reported" },
};

type Mark = { term: string; kind: string };

function marksFor(statement: Statement, facts: Fact[]): Mark[] {
  const marks: Mark[] = [];
  for (const f of facts) {
    if (f.source_statement_id !== statement.id) continue;
    const m = /^(\w+):"(.+)"$/.exec(f.certainty_reason);
    if (m && REASON_STYLE[m[1]]) marks.push({ kind: m[1], term: m[2] });
  }
  return marks;
}

function highlight(text: string, marks: Mark[]) {
  if (marks.length === 0) return text;
  const escaped = marks.map((m) => m.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) => {
    const mark = marks.find((m) => m.term.toLowerCase() === part.toLowerCase());
    if (!mark) return part;
    const style = REASON_STYLE[mark.kind];
    return (
      <span
        key={i}
        title={style.label}
        className={`underline decoration-2 underline-offset-4 ${style.cls}`}
      >
        {part}
      </span>
    );
  });
}

export default function Transcript({
  statements,
  facts,
  pending,
}: {
  statements: Statement[];
  facts: Fact[];
  pending: boolean;
}) {
  const handoffStatements = statements.filter((s) => s.role === "handoff");

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">Transcript</h3>
      <div className="flex flex-col gap-3">
        {handoffStatements.map((s) => (
          <p key={s.id} className="rounded-lg border border-line bg-bg p-4 leading-relaxed">
            {highlight(s.text, marksFor(s, facts))}
          </p>
        ))}
        {pending && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-4" aria-live="polite">
            <span className="text-sm text-muted">Transcribing…</span>
            <span className="h-3 w-full animate-pulse rounded bg-line" />
            <span className="h-3 w-4/5 animate-pulse rounded bg-line" />
          </div>
        )}
        {!pending && handoffStatements.length === 0 && (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
            Your note appears here. Uncertain words are underlined.
          </p>
        )}
      </div>
    </div>
  );
}
