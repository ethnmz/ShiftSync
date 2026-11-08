import { useState, type KeyboardEvent } from "react";
import { FIXTURE_MODE, type StatementInput } from "../../api/client";
import type { HandoffDetail } from "../../api/types";
import { Button, Card, Notice, Spinner } from "../../components/ui";
import { LevelMeter, RECORDER_ERROR_TEXT, formatTime, useRecorder } from "../../hooks/useRecorder";

type Mode = "voice" | "text";

// Capture (docs/UI.md Screen 1, step 1). One focused card: pick voice or
// text, record with a live input meter and an elapsed timer, then Finish.
// Transcription happens after Finish, so nothing here claims to be live text.
export default function CaptureStage({
  handoff,
  sending,
  sendingKind,
  error,
  onSend,
  onRetry,
  canRetry,
  onContinue,
}: {
  handoff: HandoffDetail | null;
  sending: boolean;
  sendingKind: "audio" | "text" | null;
  error: string | null;
  onSend: (input: StatementInput) => void;
  onRetry: () => void;
  canRetry: boolean;
  onContinue: () => void;
}) {
  const rec = useRecorder((audio) => onSend({ audio }));
  const [mode, setMode] = useState<Mode>(rec.supported ? "voice" : "text");
  const [text, setText] = useState("");
  const hasNote = !!handoff?.statements.some((s) => s.role === "handoff");

  function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    onSend({ text: t });
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendText();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {hasNote && (
        <Notice
          tone="ok"
          title="Note received"
          action={
            <Button variant="primary" size="sm" onClick={onContinue}>
              Continue to clarify →
            </Button>
          }
        >
          ShiftSync pulled out the items below. Add more if you forgot something.
        </Notice>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-semibold">{hasNote ? "Add to your note" : "End-of-shift note"}</h2>
            <p className="text-sm text-muted">Say it the way you'd tell the next lead. ShiftSync asks about gaps after.</p>
          </div>
        </div>

        <div role="tablist" aria-label="How to give the note" className="grid grid-cols-2 gap-1 border-b border-line bg-subtle p-1">
          {(["voice", "text"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              aria-controls={`capture-${m}`}
              id={`tab-${m}`}
              disabled={rec.recording || sending}
              onClick={() => setMode(m)}
              className={`min-h-[40px] rounded-md text-sm font-semibold disabled:opacity-50 ${
                mode === m ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
              }`}
            >
              {m === "voice" ? "🎙 Record voice" : "⌨ Type"}
            </button>
          ))}
        </div>

        <div className="p-4">
          {sending ? (
            <div className="flex min-h-[148px] flex-col items-center justify-center gap-2 text-center" aria-live="polite">
              <Spinner label={sendingKind === "audio" ? "Uploading and transcribing…" : "Analyzing your note…"} />
              <p className="text-sm text-muted">This takes a few seconds. Items and questions appear when it's done.</p>
            </div>
          ) : mode === "voice" ? (
            <div id="capture-voice" role="tabpanel" aria-labelledby="tab-voice" className="flex flex-col gap-4">
              {!rec.supported ? (
                <Notice tone="warn" title="Voice isn't available here">
                  {RECORDER_ERROR_TEXT.unsupported}
                </Notice>
              ) : rec.recording ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-danger" aria-live="polite">
                      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                      Recording
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <LevelMeter levels={rec.levels} active />
                    </div>
                    <span className="font-mono text-sm tabular-nums" aria-label={`Elapsed ${formatTime(rec.seconds)}`}>
                      {formatTime(rec.seconds)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" onClick={rec.cancel}>
                      Discard
                    </Button>
                    <Button variant="primary" size="lg" onClick={rec.finish}>
                      ■ Finish recording
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={rec.start}
                    disabled={rec.starting}
                    aria-label="Start recording"
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl text-white shadow-sm hover:bg-danger/90 disabled:opacity-50"
                  >
                    <span aria-hidden>●</span>
                  </button>
                  <p className="text-sm text-muted">{rec.starting ? "Waiting for the microphone…" : "Tap to start. Tap Finish when you're done."}</p>
                </div>
              )}
              {rec.error && rec.error !== "unsupported" && (
                <Notice
                  tone="warn"
                  role="alert"
                  title="Microphone problem"
                  action={
                    <Button size="sm" onClick={() => setMode("text")}>
                      Type instead
                    </Button>
                  }
                >
                  {RECORDER_ERROR_TEXT[rec.error]}
                </Notice>
              )}
              {FIXTURE_MODE && (
                <p className="text-xs text-faint">
                  Offline demo: recordings aren't transcribed. The scripted note from the demo scenario is used.
                </p>
              )}
            </div>
          ) : (
            <div id="capture-text" role="tabpanel" aria-labelledby="tab-text" className="flex flex-col gap-3">
              <label htmlFor="note-text" className="sr-only">
                Handoff note
              </label>
              <textarea
                id="note-text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                placeholder="e.g. UPS-B maintenance is mostly finished. The vendor is coming back tomorrow…"
                className="block w-full resize-y rounded-lg border border-line-strong bg-surface p-3 text-base placeholder:text-faint"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-faint">⌘/Ctrl + Enter to send</span>
                <Button variant="primary" onClick={sendText} disabled={!text.trim()}>
                  Send note
                </Button>
              </div>
              {FIXTURE_MODE && <p className="text-xs text-faint">Offline demo: the first note always loads the scripted demo scenario.</p>}
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Notice
          tone="danger"
          role="alert"
          title="The note wasn't sent"
          action={
            <div className="flex gap-2">
              {canRetry && (
                <Button size="sm" onClick={onRetry}>
                  Try again
                </Button>
              )}
              <Button size="sm" onClick={() => setMode("text")}>
                Type instead
              </Button>
            </div>
          }
        >
          {error}
        </Notice>
      )}
    </div>
  );
}
