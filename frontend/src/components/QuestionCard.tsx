import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, fieldClass, Notice, Spinner } from "./ui";
import { LevelMeter, RECORDER_ERROR_TEXT, formatTime, useRecorder } from "../hooks/useRecorder";

// One open-ended question with a text box and an optional voice answer.
// Shared by Clarify (Shift A) and the understanding check (Shift B). The
// caller supplies the progress, extra actions and the feedback shown below.
export default function QuestionCard({
  eyebrow,
  question,
  why,
  sending,
  sendingLabel = "Sending…",
  submitLabel,
  placeholder = "Type your answer…",
  onText,
  onAudio,
  secondary,
  feedback,
  disabled = false,
}: {
  eyebrow: ReactNode;
  question: string;
  why?: string;
  sending: boolean;
  sendingLabel?: string;
  submitLabel: string;
  placeholder?: string;
  onText: (text: string) => void;
  onAudio?: (audio: Blob) => void;
  secondary?: ReactNode;
  feedback?: ReactNode;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const rec = useRecorder((audio) => onAudio?.(audio));
  const busy = sending || rec.recording || disabled;

  function send() {
    const t = text.trim();
    if (!t || busy) return;
    onText(t);
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm font-semibold text-muted">{eyebrow}</div>
      <h2 className="text-xl font-semibold leading-snug">{question}</h2>
      {why && (
        <p className="flex gap-2 text-sm text-warn">
          <span aria-hidden>↳</span>
          <span>
            <span className="sr-only">Why this is asked: </span>
            {why}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="answer" className="text-sm font-semibold">
          Your answer
        </label>
        {rec.recording ? (
          <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-danger" aria-live="polite">
                <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Recording
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <LevelMeter levels={rec.levels} active />
              </div>
              <span className="font-mono text-sm tabular-nums">{formatTime(rec.seconds)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={rec.cancel}>
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={rec.finish}>
                ■ Finish and send
              </Button>
            </div>
          </div>
        ) : (
          <textarea
            id="answer"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            disabled={sending || disabled}
            placeholder={placeholder}
            className={`${fieldClass} block resize-y py-3`}
          />
        )}
        {rec.error && rec.error !== "unsupported" && (
          <Notice tone="warn" role="alert">
            {RECORDER_ERROR_TEXT[rec.error]}
          </Notice>
        )}
      </div>

      {sending ? (
        <Spinner label={sendingLabel} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {onAudio && rec.supported && !rec.recording && (
              <Button onClick={rec.start} disabled={busy || rec.starting} aria-label="Answer by voice">
                🎙 Answer by voice
              </Button>
            )}
            {secondary}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-faint sm:inline">Enter to send</span>
            <Button variant="primary" onClick={send} disabled={busy || !text.trim()}>
              {submitLabel}
            </Button>
          </div>
        </div>
      )}

      {feedback && <div aria-live="polite">{feedback}</div>}
    </div>
  );
}
