import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FIXTURE_MODE, createHandoff, errorMessage, postStatement, type StatementInput } from "../../api/client";
import type { Certainty, HandoffDetail } from "../../api/types";
import AudioBubble from "../../components/AudioBubble";
import CertaintyBadge from "../../components/CertaintyBadge";
import { Button } from "../../components/ui";
import { LevelMeter, RECORDER_ERROR_TEXT, formatTime, useRecorder } from "../../hooks/useRecorder";
import { isEditable } from "../../review";
import { person, useUser } from "../../session/user";
import { DEMO_INCOMING_ID, PageWidth, suggestedStep, useFlow, useHandoffQuery } from "./CreateFlow";

type Mode = "record" | "type";
const RANK: Record<Certainty, number> = { unknown: 0, unverified: 1, reported: 2, confirmed: 3 };

function Typing() {
  return (
    <div className="flex items-end gap-1" role="status" aria-label="ShiftSync is analyzing your note">
      <span className="h-2 w-2 rounded-full bg-subtle" aria-hidden />
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-subtle px-4 py-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
    </div>
  );
}

// ShiftSync's reply to the note: what it pulled out and what comes next.
function Reply({ handoff, onContinue }: { handoff: HandoffDetail; onContinue: () => void }) {
  const pending = handoff.questions.filter((q) => q.status === "pending").length;
  const order = { critical: 0, important: 1, routine: 2 } as const;
  const items = [...handoff.items].sort((a, b) => order[a.priority] - order[b.priority]);
  return (
    <div className="max-w-[88%] self-start rounded-2xl border border-line bg-surface p-5">
      <p className="leading-relaxed">
        I pulled {items.length} item{items.length === 1 ? "" : "s"} out of your note.{" "}
        {pending ? `I have up to ${handoff.budget.max} quick questions before ${handoff.incoming.name.split(" ")[0]} takes over.` : "Nothing important is missing."}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => {
          const lowest = item.facts.reduce<Certainty>((m, f) => (RANK[f.certainty] < RANK[m] ? f.certainty : m), "confirmed");
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
              <CertaintyBadge certainty={lowest} />
              <span className="font-medium">{item.title}</span>
              {item.priority === "critical" && <span className="text-xs font-semibold text-danger">Critical</span>}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <span className="text-xs text-muted">Nothing hedged was turned into a confirmed fact.</span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={onContinue}>
          {pending ? "Continue to clarify →" : "Continue to review →"}
        </Button>
      </div>
    </div>
  );
}

// Step 1 of 3. A conversation-style card with the note and ShiftSync's
// reply, a type-instead box, and a large Record pill docked at the bottom.
export default function RecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useUser();
  const flow = useFlow();
  const { data: handoff } = useHandoffQuery(id);
  const [mode, setMode] = useState<Mode>("record");
  const [text, setText] = useState("");
  const lastInput = useRef<StatementInput | null>(null); // memory only, for one retry

  const send = useMutation({
    mutationFn: async (input: StatementInput) => {
      lastInput.current = input;
      flow.start();
      const hid = id ?? (await createHandoff(user.id, DEMO_INCOMING_ID)).id;
      return postStatement(hid, input);
    },
    onSuccess: (d) => {
      const before = new Set(handoff?.statements.map((s) => s.id) ?? []);
      const fresh = d.statements.filter((s) => s.role === "handoff" && !before.has(s.id));
      if (flow.pendingClip.current && fresh.length) flow.attachClip(fresh[fresh.length - 1].id, flow.pendingClip.current);
      flow.pendingClip.current = null;
      lastInput.current = null;
      qc.setQueryData(["handoff", d.id], d);
      // The first note moves straight on; later additions stay here.
      const first = !handoff?.statements.some((s) => s.role === "handoff");
      navigate(first ? `/create/${d.id}/${suggestedStep(d)}` : `/create/${d.id}/record`, { replace: !id });
    },
  });

  const rec = useRecorder((audio, peaks) => {
    flow.pendingClip.current = { url: URL.createObjectURL(audio), peaks, seconds: rec.seconds };
    send.mutate({ audio });
  });

  const notes = handoff?.statements.filter((s) => s.role === "handoff") ?? [];
  const locked = handoff ? !isEditable(handoff.state) : false;
  const totalSeconds = [...flow.clips.values()].reduce((n, c) => n + c.seconds, 0);
  const incoming = handoff?.incoming.name ?? person(DEMO_INCOMING_ID)?.name;

  function sendText() {
    const t = text.trim();
    if (!t || send.isPending || locked) return;
    send.mutate({ text: t });
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }

  return (
    <PageWidth>
      <section aria-label="Handoff note" className="flex min-h-[calc(100vh-22rem)] flex-col rounded-2xl border border-line bg-surface">
        {/* Card header: mode toggle and exit */}
        <div className="relative flex items-center justify-center border-b border-line px-4 py-3">
          <div role="tablist" aria-label="How to give the note" className="flex rounded-xl bg-subtle p-1">
            {(["record", "type"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                disabled={rec.recording || send.isPending}
                onClick={() => setMode(m)}
                className={`min-h-[36px] rounded-lg px-5 text-sm font-semibold disabled:opacity-50 ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {m === "record" ? "Record" : "Type"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Leave the handoff (it stays saved)"
            className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted hover:bg-subtle hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Conversation */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
          <span className="self-center rounded-full border border-line px-3.5 py-1 text-sm text-muted">Handoff to {incoming}</span>

          {notes.length === 0 && !send.isPending && (
            <div className="m-auto flex max-w-sm flex-col items-center gap-2 py-10 text-center">
              <h1 className="text-xl font-semibold">What is the next shift taking over?</h1>
              <p className="text-sm text-muted">
                Talk it through the way you'd tell {incoming?.split(" ")[0]}: what's done, what isn't, and what you're not sure about. ShiftSync asks
                about the gaps next.
              </p>
            </div>
          )}

          {notes.map((s) => {
            const clip = flow.clips.get(s.id);
            const src = clip?.url ?? (!FIXTURE_MODE && s.audio_url ? s.audio_url : null);
            return (
              <div key={s.id} className="flex max-w-[88%] flex-col gap-2 self-end rounded-2xl rounded-br-md bg-subtle px-4 py-3">
                {src && <AudioBubble src={src} peaks={clip?.peaks} label="your note" />}
                <p className={src ? "text-sm text-muted" : "leading-relaxed"}>{s.text}</p>
              </div>
            );
          })}

          {send.isPending && (
            <>
              {send.variables && "text" in send.variables && (
                <div className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-subtle px-4 py-3 leading-relaxed">{send.variables.text}</div>
              )}
              {send.variables && "audio" in send.variables && (
                <div className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-subtle px-4 py-3 text-sm text-muted">Uploading and transcribing…</div>
              )}
              <Typing />
            </>
          )}

          {handoff && notes.length > 0 && !send.isPending && <Reply handoff={handoff} onContinue={() => navigate(`/create/${handoff.id}/${suggestedStep(handoff) === "record" ? "clarify" : suggestedStep(handoff)}`)} />}

          {send.isError && (
            <div role="alert" className="max-w-[88%] self-start rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm">
              <p className="font-semibold text-danger">The note wasn't sent</p>
              <p className="mt-1">{errorMessage(send.error, "Something went wrong. Try again, or type it instead.")}</p>
              <div className="mt-3 flex gap-2">
                {lastInput.current && (
                  <Button size="sm" onClick={() => lastInput.current && send.mutate(lastInput.current)}>
                    Try again
                  </Button>
                )}
                <Button size="sm" onClick={() => setMode("type")}>
                  Type instead
                </Button>
              </div>
            </div>
          )}

          {rec.error && rec.error !== "unsupported" && (
            <div role="alert" className="max-w-[88%] self-start rounded-2xl border border-warn/40 bg-warn/5 p-4 text-sm">
              {RECORDER_ERROR_TEXT[rec.error]}
            </div>
          )}
        </div>

        {/* Type-instead box */}
        <div className="px-4 pb-4 sm:px-5">
          {locked ? (
            <p className="rounded-xl bg-subtle px-4 py-3 text-sm text-muted">Submitted. The note can't be changed now.</p>
          ) : (
            <div className="rounded-xl bg-subtle px-4 py-3 focus-within:ring-2 focus-within:ring-accent/40">
              <label htmlFor="note-text" className="sr-only">
                Type your handoff note
              </label>
              <textarea
                id="note-text"
                rows={mode === "type" ? 4 : 1}
                value={text}
                onFocus={() => setMode("type")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                disabled={send.isPending || rec.recording}
                placeholder={notes.length ? "Add something you forgot…" : "Type your handoff instead…"}
                className="block w-full resize-none bg-transparent text-base outline-none placeholder:text-faint disabled:opacity-60"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-faint">{FIXTURE_MODE ? "Offline demo: the first note loads the scripted scenario." : "Enter to send · Shift+Enter for a new line"}</span>
                {text.trim() ? (
                  <Button size="sm" variant="primary" onClick={sendText} disabled={send.isPending}>
                    Send
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={rec.start}
                    disabled={!rec.supported || rec.recording || send.isPending}
                    aria-label="Record instead"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted hover:text-ink disabled:opacity-40"
                  >
                    🎙
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {totalSeconds > 0 && (
        <p className="mt-2 px-1 text-sm tabular-nums text-muted">
          <span aria-hidden>▶</span> {formatTime(totalSeconds)} recorded
        </p>
      )}

      {/* Docked Record pill */}
      {!locked && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4 md:left-[272px]">
          <div className="w-full max-w-md rounded-full border border-line bg-surface p-2 shadow-lg">
            {!rec.supported ? (
              <p className="px-4 py-3 text-center text-sm text-muted">{RECORDER_ERROR_TEXT.unsupported}</p>
            ) : rec.recording ? (
              <div className="flex items-center gap-3 rounded-full bg-ink px-3 py-2 text-bg">
                <button type="button" onClick={rec.cancel} className="min-h-[40px] rounded-full px-3 text-sm font-medium text-bg/70 hover:text-bg">
                  Discard
                </button>
                <div className="min-w-0 flex-1 overflow-hidden" aria-hidden>
                  <LevelMeter levels={rec.levels.slice(0, 24)} active />
                </div>
                <span className="font-mono text-sm tabular-nums" aria-live="polite" aria-label={`Recording, ${formatTime(rec.seconds)}`}>
                  {formatTime(rec.seconds)}
                </span>
                <button type="button" onClick={rec.finish} className="min-h-[40px] rounded-full bg-bg px-4 text-sm font-semibold text-ink">
                  ■ Finish
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={rec.start}
                disabled={send.isPending || rec.starting}
                className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full bg-ink text-lg font-semibold text-bg hover:bg-ink/90 disabled:opacity-60"
              >
                <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-danger">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
                {rec.starting ? "Starting…" : send.isPending ? "Analyzing…" : notes.length ? "Record more" : "Record"}
              </button>
            )}
          </div>
        </div>
      )}
    </PageWidth>
  );
}
