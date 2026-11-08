import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { getHandoff } from "../../api/client";
import type { HandoffDetail } from "../../api/types";
import { formatElapsed } from "../../labels";
import { isEditable } from "../../review";
import { person, useUser } from "../../session/user";

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
    <nav aria-label="Handoff steps" className="flex rounded-xl border border-line bg-surface p-1">
      {STEPS.map((s, i) =>
        id && reachable[s.id] ? (
          <NavLink
            key={s.id}
            to={`/create/${id}/${s.id}`}
            className={({ isActive }) =>
              `flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold sm:px-4 ${
                isActive ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="sr-only">Step </span>
                <span aria-hidden className="text-xs opacity-70">{i + 1}</span>
                {s.label}
                {isActive && <span className="sr-only"> (current)</span>}
              </>
            )}
          </NavLink>
        ) : (
          <span
            key={s.id}
            aria-current={!id && s.id === "record" ? "step" : undefined}
            className={`flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold sm:px-4 ${
              !id && s.id === "record" ? "bg-ink text-white" : "text-faint"
            }`}
          >
            <span aria-hidden className="text-xs opacity-70">{i + 1}</span>
            {s.label}
          </span>
        ),
      )}
    </nav>
  );
}

// Step-by-step layout for Shift A (Record -> Clarify -> Review) inside the
// dashboard shell, styled like Home.
export default function CreateFlow() {
  // One mounted layout for every step, so the timer and recordings survive
  // moving between pages. The child route's :id is read from the URL here.
  const id = useMatch("/create/:id/*")?.params.id;
  const { user } = useUser();
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

  const incoming = handoff?.incoming.name ?? person(DEMO_INCOMING_ID)?.name;
  return (
    <FlowContext.Provider value={value}>
      <div className="flex flex-1 flex-col px-4 pt-6 sm:px-10 lg:px-14">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tighter sm:text-[44px]">{id ? "Your handoff" : "New handoff"}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-muted">
                <span>
                  {user.name} → {incoming}
                </span>
                {id && <span>· {id}</span>}
                {elapsed !== null && (
                  <span className="tabular-nums" aria-label="Time on this handoff">
                    · {formatElapsed(elapsed)}
                  </span>
                )}
              </p>
            </div>
            <StepPill id={id} handoff={handoff} />
          </div>
        </div>
        <Outlet />
      </div>
    </FlowContext.Provider>
  );
}

export function PageWidth({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto mt-8 flex w-full flex-1 flex-col pb-40 ${wide ? "max-w-[1180px]" : "max-w-3xl"}`}>{children}</div>;
}
