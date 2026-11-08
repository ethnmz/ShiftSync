import { useState } from "react";
import type { HandoffDetail } from "../../api/types";
import Panel from "../../components/Panel";
import RecordButton from "../../components/RecordButton";
import Transcript from "../../components/Transcript";

export default function CaptureSection({
  handoff,
  pending,
  locked,
  error,
  onSubmit,
}: {
  handoff: HandoffDetail | null;
  pending: boolean;
  locked: boolean;
  error: string | null;
  onSubmit: (input: { audio: Blob } | { text: string }) => void;
}) {
  const [text, setText] = useState("");
  const facts = handoff?.items.flatMap((i) => i.facts) ?? [];

  function sendText() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit({ text: trimmed });
    setText("");
  }

  return (
    <Panel step={1} title="Capture">
      {locked ? (
        <p className="rounded-lg border border-line p-4 text-sm text-muted">Submitted. The note can no longer be changed.</p>
      ) : (
      <>
      {handoff && handoff.statements.some((s) => s.role === "handoff") && (
        <p className="text-center text-sm text-muted">Forgot something? Record or type another note.</p>
      )}
      <RecordButton onRecorded={(audio) => onSubmit({ audio })} disabled={pending} />

      <details className="rounded-lg border border-line">
        <summary className="flex min-h-touch cursor-pointer items-center px-4 text-sm font-medium">
          Type instead
        </summary>
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="End-of-shift note…"
            className="block w-full resize-y rounded-lg border border-line bg-bg p-3 text-base"
          />
          <button
            type="button"
            onClick={sendText}
            disabled={pending || !text.trim()}
            className="min-h-touch self-end rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send note
          </button>
        </div>
      </details>
      </>
      )}

      {error && <p className="text-sm text-amber-500">⚠ {error}</p>}

      <Transcript statements={handoff?.statements ?? []} facts={facts} pending={pending} />
    </Panel>
  );
}
