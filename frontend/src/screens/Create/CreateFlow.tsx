import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useMatch } from "react-router-dom";
import { FIXTURE_MODE, getHandoff } from "../../api/client";
import type { HandoffDetail } from "../../api/types";
import { formatElapsed } from "../../labels";
import { isEditable } from "../../review";
import { DEMO_USERS, useUser } from "../../session/user";

// The demo pairing (demo/scenario.json step 1). docs/UI.md does not say how
// the incoming lead is picked yet.
export const DEMO_INCOMING_ID = "jordan";

export type Step = "record" | "clarify" | "review";

export function suggestedStep(h: HandoffDetail | null | undefined): Step {
  if (!h || !h.statements.some((s) => s.role === "handoff")) return "record";
  if (h.questions.some((q) => q.status === "pending")) return "clarify";
  return "review";
}

// A recording made in this tab. Kept in memory only (never written to
// browser storage) so the operator can replay what they said.
export interface Clip {
  url: string;
  peaks: number[];
  seconds: number;
}

interface FlowState {
  startedAt: number | null;
  stoppedAt: number | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
  clips: Map<string, Clip>; // statement id -> clip
  pendingClip: React.MutableRefObject<Clip | null>;
  attachClip: (statementId: string, clip: Clip) => void;
}

const FlowContext = createContext<FlowState | null>(null);
export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow outside CreateFlow");
  return ctx;
}

export function useHandoffQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["handoff", id],
    queryFn: () => getHandoff(id!),
    enabled: !!id,
    refetchInterval: 1500, // docs/UI.md: poll the active handoff
  });
}

function useElapsed(startedAt: number | null, stoppedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, stoppedAt]);
  return startedAt === null ? null : Math.max(0, Math.floor(((stoppedAt ?? now) - startedAt) / 1000));
}

const STEPS: { id: Step; label: string }[] = [
  { id: "record", label: "Record" },
  { id: "clarify", label: "Clarify" },
  { id: "review", label: "Review" },
];

function StepPill({ id, handoff }: { id?: string; handoff?: HandoffDetail }) {
  const reachable: Record<Step, boolean> = {
    record: !handoff || isEditable(handoff.state),
    clarify: !!handoff && handoff.statements.length > 0 && isEditable(handoff.state),
    review: !!handoff && handoff.items.length > 0,
  };
  return (
    <nav aria-label="Handoff steps" className="flex rounded-xl bg-subtle p-1">
      {STEPS.map((s, i) =>
        id && reachable[s.id] ? (
          <NavLink
            key={s.id}
            to={`/create/${id}/${s.id}`}
            className={({ isActive }) =>
              `flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold sm:px-5 ${
                isActive ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="sr-only">Step {i + 1}: </span>
                {s.label}
                {isActive && <span className="sr-only"> (current)</span>}
              </>
            )}
          </NavLink>
        ) : (
          <span
            key={s.id}
            aria-current={!id && s.id === "record" ? "step" : undefined}
            className={`flex min-h-[36px] items-center rounded-lg px-2.5 text-sm font-semibold sm:px-5 ${
              !id && s.id === "record" ? "bg-surface text-ink shadow-sm" : "text-faint"
            }`}
          >
            {s.label}
          </span>
        ),
      )}
    </nav>
  );
}

// Full-screen, step-by-step layout for Shift A (Record -> Clarify -> Review),
// outside the app shell so the operator only sees the step at hand.
export default function CreateFlow() {
  // One mounted layout for every step, so the timer and recordings survive
  // moving between pages. The child route's :id is read from the URL here.
  const id = useMatch("/create/:id/*")?.params.id;
  const { user, setUser } = useUser();
  const { data: handoff } = useHandoffQuery(id);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [clips, setClips] = useState<Map<string, Clip>>(() => new Map());
  const pendingClip = useRef<Clip | null>(null);
  const elapsed = useElapsed(startedAt, stoppedAt);

  // Release recordings when leaving the flow.
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  useEffect(() => () => clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url)), []);

  const value: FlowState = {
    startedAt,
    stoppedAt,
    start: () => setStartedAt((t) => t ?? Date.now()),
    stop: () => setStoppedAt(Date.now()),
    reset: () => {
      setStartedAt(null);
      setStoppedAt(null);
      clips.forEach((c) => URL.revokeObjectURL(c.url));
      setClips(new Map());
    },
    clips,
    pendingClip,
    attachClip: (sid, clip) => setClips((m) => new Map(m).set(sid, clip)),
  };

  return (
    <FlowContext.Provider value={value}>
      <div className="flex min-h-screen flex-col bg-bg">
        <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-bg/90 px-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-6 backdrop-blur sm:px-6">
          <Link to="/" className="flex items-center gap-2 justify-self-start" aria-label="ShiftSync home">
            <Mark />
            <span className="hidden text-base font-bold tracking-tight sm:inline">ShiftSync</span>
          </Link>
          <div className="justify-self-center"><StepPill id={id} handoff={handoff} /></div>
          <div className="flex items-center gap-2 justify-self-end">
            {elapsed !== null && (
              <span className="hidden text-sm tabular-nums text-muted sm:inline" aria-label="Time on this handoff">
                {formatElapsed(elapsed)}
              </span>
            )}
            {FIXTURE_MODE && (
              <span className="hidden rounded-md border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-xs font-semibold text-warn md:inline" title="No backend: scripted fixtures">
                Offline demo
              </span>
            )}
            <label htmlFor="flow-user" className="sr-only">
              Demo user (not sign-in)
            </label>
            <select
              id="flow-user"
              value={user.id}
              onChange={(e) => setUser(e.target.value)}
              title="Demo user, not sign-in"
              className="min-h-[36px] w-[4.75rem] rounded-full border border-line bg-surface px-2 text-sm sm:w-auto sm:max-w-[9rem] sm:px-3"
            >
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name.split(" ")[0]} · {u.role}
                </option>
              ))}
            </select>
          </div>
        </header>
        <Outlet />
      </div>
    </FlowContext.Provider>
  );
}

// ShiftSync's own mark: two offset bars for the two shifts.
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="text-ink">
      <rect x="3" y="7" width="16" height="5" rx="2.5" fill="currentColor" />
      <rect x="9" y="16" width="16" height="5" rx="2.5" fill="rgb(var(--accent))" />
    </svg>
  );
}

export function PageWidth({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={`mx-auto flex w-full flex-1 flex-col px-4 pb-40 pt-2 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>;
}
