import { useState, type KeyboardEvent } from "react";
import type { AnswerInput } from "../api/client";
import type { Question } from "../api/types";
import { formatTime, useRecorder } from "../hooks/useRecorder";

// One clarification at a time (docs/UI.md Screen 1, Clarify). Layout follows
// the docked "1 / 3" question card common in AI assistants: counter and
// progress in the header, the reason it was asked, the question, one answer
// box with the mic, and "I don't know" in the skip slot. There is no Back
// button: the API has no route to re-answer a question.
export default function QuestionCard({
  question,
  number,
  max,
  pending,
  onAnswer,
}: {
  question: Question;
  number: number;
  max: number;
  pending: boolean;
  onAnswer: (input: AnswerInput) => void;
}) {
  const [text, setText] = useState("");
  const { recording, seconds, levels, error, toggle } = useRecorder((audio) => onAnswer({ audio }));
  const busy = pending || recording;

  function sendText() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onAnswer({ text: trimmed });
    setText("");
  }

  // Enter sends, Shift+Enter adds a line.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }

  return (
    <article
      aria-labelledby={`q-${question.id}`}
      className="overflow-hidden rounded-2xl border border-line bg-bg shadow-lg shadow-black/20 ring-1 ring-accent/30"
    >
      <header className="flex flex-col gap-2 border-b border-line px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-accent">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            ShiftSync is asking
          </span>
          <span className="text-sm tabular-nums text-muted" aria-label={`Question ${number} of up to ${max}`}>
            {number} / {max}
          </span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i < number - 1 ? "bg-accent" : i === number - 1 ? "bg-accent/50" : "bg-line"}`}
            />
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="flex items-start gap-2 text-sm text-amber-500">
          <span aria-hidden>↳</span>
          <span>
            <span className="sr-only">Why asked: </span>
            {question.why_asked}
          </span>
        </p>
        <p id={`q-${question.id}`} className="text-xl font-semibold leading-snug">
          {question.text}
        </p>

        <div
          className={`flex items-end gap-2 rounded-xl border bg-panel p-2 transition-colors focus-within:border-accent ${
            recording ? "border-red-500/60" : "border-line"
          }`}
        >
          {recording ? (
            <div className="flex min-h-[5.5rem] flex-1 flex-col justify-center gap-2 px-2" aria-live="polite">
              <span className="text-sm text-red-400">Listening · {formatTime(seconds)}</span>
              <div className="flex h-6 items-center gap-[3px]" aria-hidden>
                {levels.map((l, i) => (
                  <span key={i} className="w-1 rounded-full bg-red-500" style={{ height: `${Math.max(12, l * 100)}%` }} />
                ))}
              </div>
            </div>
          ) : (
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={pending}
              aria-label="Your answer"
              placeholder={pending ? "Sending…" : "Say it or type it…"}
              className="block w-full flex-1 resize-none bg-transparent p-2 text-base outline-none disabled:opacity-60"
            />
          )}
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={recording}
            aria-label={recording ? "Stop and send voice answer" : "Answer by voice"}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-40 ${
              recording ? "bg-red-700" : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {recording ? "■" : "🎙"}
          </button>
        </div>
        {error && <p className="text-sm text-amber-500">⚠ {error}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel/60 px-4 py-3">
        <button
          type="button"
          onClick={() => onAnswer({ dontKnow: true })}
          disabled={busy}
          className="min-h-touch rounded-lg border-2 border-line px-4 text-sm font-semibold hover:border-violet-400/60 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ? I don't know
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">Enter ↵ to send</span>
          <button
            type="button"
            onClick={sendText}
            disabled={busy || !text.trim()}
            className="min-h-touch rounded-lg bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Sending…" : "Answer"}
          </button>
        </div>
      </footer>
    </article>
  );
}
