import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { errorMessage, listFollowups, listHandoffs } from "../../api/client";
import type { HandoffState, HandoffSummary } from "../../api/types";
import { CheckCircleIcon, FlagIcon, HelpIcon, InboxIcon, ListIcon } from "../../components/icons";
import { DashCard, Notice, Skeleton } from "../../components/ui";
import { formatClock, formatWhen } from "../../labels";
import { useUser } from "../../session/user";
import { ownerName } from "../../components/FollowUpRow";

const EDITABLE: HandoffState[] = ["draft", "analyzing", "clarifying", "in_review"];
const STEP_OF: Partial<Record<HandoffState, { n: number; path: string; label: string }>> = {
  draft: { n: 1, path: "record", label: "Record" },
  analyzing: { n: 1, path: "record", label: "Record" },
  clarifying: { n: 2, path: "clarify", label: "Clarify" },
  in_review: { n: 3, path: "review", label: "Review" },
};
const STATE_LABEL: Record<HandoffState, string> = {
  draft: "Draft",
  analyzing: "Analyzing",
  clarifying: "Clarifying",
  in_review: "In review",
  submitted: "Waiting for acknowledgment",
  acknowledged: "Acknowledged, not yet verified",
  verifying: "Check in progress",
  verified: "Understanding verified",
  verified_with_assistance: "Verified with assistance",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// Outlined "View" button, or the flat gray disabled pill when there's nothing to do.
function ActionLink({ to, children }: { to: string | null; children: ReactNode }) {
  if (!to)
    return (
      <span aria-disabled="true" className="inline-flex min-h-[44px] min-w-[96px] items-center justify-center rounded-lg bg-subtle px-5 text-sm font-semibold text-faint">
        {children}
      </span>
    );
  return (
    <Link to={to} className="inline-flex min-h-[40px] min-w-[80px] items-center justify-center rounded-lg border-2 border-ink px-4 text-sm font-semibold text-ink hover:bg-subtle">
      {children}
    </Link>
  );
}

// Flat, original illustration: two shift cards passing a note between them.
function Illustration() {
  return (
    <svg viewBox="0 0 520 300" className="h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="520" height="300" fill="#bcd5f5" />
      <path d="M0 300 L150 0 H520 V300Z" fill="#a9c8f2" />
      <path d="M60 300 L230 40" stroke="#2d4fbf" strokeWidth="1.5" fill="none" />
      <path d="M380 0 L520 120" stroke="#2d4fbf" strokeWidth="1.5" fill="none" />
      <g transform="translate(150 70) rotate(-8)">
        <rect width="150" height="190" rx="10" fill="#f7f9ff" />
        <rect x="22" y="30" width="96" height="12" rx="6" fill="#2d4fbf" />
        <rect x="22" y="56" width="106" height="9" rx="4.5" fill="#2d4fbf" opacity=".55" />
        <rect x="22" y="76" width="80" height="9" rx="4.5" fill="#2d4fbf" opacity=".55" />
        <circle cx="34" cy="128" r="12" fill="#e9b949" />
        <rect x="54" y="122" width="70" height="9" rx="4.5" fill="#2d4fbf" opacity=".35" />
      </g>
      <g transform="translate(285 95) rotate(7)">
        <rect width="150" height="170" rx="10" fill="#1f3ea8" />
        <rect x="22" y="30" width="80" height="12" rx="6" fill="#e6edff" />
        <path d="M24 72 l14 14 26-30" stroke="#8ee0a8" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="22" y="112" width="100" height="9" rx="4.5" fill="#e6edff" opacity=".6" />
        <rect x="22" y="132" width="70" height="9" rx="4.5" fill="#e6edff" opacity=".6" />
      </g>
      <path d="M300 60 q40 -30 80 6" stroke="#1f3ea8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M372 54 l10 12 -15 3" fill="#1f3ea8" />
    </svg>
  );
}

// Home (docs/UI.md app shell). Everything on it comes from GET /handoffs and
// GET /followups; nothing is filled in when those are empty.
export default function HomeScreen() {
  const { user } = useUser();
  const handoffs = useQuery({ queryKey: ["handoffs"], queryFn: listHandoffs, refetchInterval: 5000 });
  const followups = useQuery({ queryKey: ["followups", "open"], queryFn: () => listFollowups("open"), refetchInterval: 5000 });
  const list: HandoffSummary[] = handoffs.data ?? [];

  const draft = list.find((h) => EDITABLE.includes(h.state));
  const toAck = list.filter((h) => h.state === "submitted");
  const toCheck = list.filter((h) => h.state === "acknowledged" || h.state === "verifying");
  const mineToAck = toAck.find((h) => h.incoming?.id === user.id);
  const step = draft ? STEP_OF[draft.state] : undefined;
  const open = followups.data ?? [];

  const hero = mineToAck
    ? {
        title: `${mineToAck.outgoing?.name ?? "The outgoing lead"}'s handoff is waiting for you.`,
        body: "Read the briefing, acknowledge it, then check your understanding of the critical items.",
        cta: "Open the briefing",
        to: `/receive/${mineToAck.id}`,
      }
    : draft
      ? {
          title: "Finish your end-of-shift handoff.",
          body: `You're on ${step?.label ?? "Record"}. Your note and answers are saved.`,
          cta: "Continue handoff",
          to: `/create/${draft.id}/${step?.path ?? "record"}`,
        }
      : {
          title: "Hand off your shift in about three minutes.",
          body: "Record it in your own words, answer up to three questions, then check what ShiftSync wrote down.",
          cta: "Start handoff",
          to: "/create",
        };

  return (
    <div className="relative flex-1 px-4 pb-28 pt-6 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex justify-end">
          <a href="https://github.com/ethnmz/hackutd2026/issues/1" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:underline">
            <HelpIcon /> Team board
          </a>
        </div>
        <h1 className="mt-6 text-4xl font-semibold">
          {greeting()}, {user.name.split(" ")[0]}!
        </h1>

        {handoffs.isError && (
          <div className="mt-6">
            <Notice tone="danger" role="alert" title="Couldn't load handoffs">
              {errorMessage(handoffs.error, "The request failed.")}
            </Notice>
          </div>
        )}

        {/* Hero */}
        <section className="mt-8 grid overflow-hidden rounded-panel border border-line bg-[#fdfbf6] shadow-panel lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-start gap-6 p-8 sm:p-10">
            <h2 className="max-w-lg text-3xl font-semibold">{hero.title}</h2>
            <p className="max-w-md text-muted">{hero.body}</p>
            <Link to={hero.to} className="inline-flex min-h-[52px] items-center rounded-xl bg-ink px-6 text-base font-semibold text-white hover:bg-ink/90">
              {hero.cta}
            </Link>
          </div>
          <div className="hidden min-h-[260px] lg:block">
            <Illustration />
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <DashCard icon={<CheckCircleIcon />} title="Waiting on you">
              {handoffs.isLoading ? (
                <Skeleton />
              ) : (
                <ul className="divide-y divide-line">
                  <li className="flex items-center justify-between gap-4 pb-5">
                    <span className={toAck.length ? "text-lg" : "text-lg text-faint"}>
                      {toAck.length ? `${toAck.length} handoff${toAck.length === 1 ? "" : "s"} to acknowledge` : "No handoffs to acknowledge"}
                    </span>
                    <ActionLink to={toAck[0] ? `/receive/${toAck[0].id}` : null}>Acknowledge</ActionLink>
                  </li>
                  <li className="flex items-center justify-between gap-4 pt-5">
                    <span className={toCheck.length ? "text-lg" : "text-lg text-faint"}>
                      {toCheck.length ? `${toCheck.length} understanding check${toCheck.length === 1 ? "" : "s"} open` : "No understanding checks open"}
                    </span>
                    <ActionLink to={toCheck[0] ? `/receive/${toCheck[0].id}` : null}>Check</ActionLink>
                  </li>
                </ul>
              )}
            </DashCard>

            <DashCard icon={<InboxIcon />} title="How a handoff works">
              <ol className="flex flex-col gap-3 text-base leading-relaxed">
                <li>
                  <strong>Record</strong> what the next shift is taking over, in your own words.
                </li>
                <li>
                  <strong>Clarify</strong>: ShiftSync asks up to three questions about what's missing. "I don't know" is always an answer.
                </li>
                <li>
                  <strong>Review</strong> what it wrote down, then submit.
                </li>
                <li>
                  The incoming lead <strong>acknowledges</strong> receipt, then <strong>answers a short check</strong> so misunderstandings surface before
                  work starts.
                </li>
              </ol>
              <p className="mt-4 text-sm text-muted">Acknowledging or verifying a handoff never closes open issues or confirms equipment is safe.</p>
            </DashCard>
          </div>

          <div className="flex flex-col gap-8">
            <DashCard icon={<FlagIcon />} title="Open follow-ups" aside={<span className="text-sm text-muted">{open.length} open</span>}>
              {followups.isLoading ? (
                <Skeleton />
              ) : followups.isError ? (
                <Notice tone="danger" role="alert">
                  {errorMessage(followups.error, "Couldn't load follow-ups.")}
                </Notice>
              ) : open.length === 0 ? (
                <p className="text-lg text-faint">No open follow-ups</p>
              ) : (
                <ul className="flex flex-col gap-6">
                  {open.slice(0, 3).map((f) => (
                    <li key={f.id} className="flex items-start gap-4">
                      <span
                        className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${ownerName(f) ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}
                        aria-hidden
                      >
                        <FlagIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{f.description}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          Owner: {f.owner_label} · Due: {formatWhen(f.deadline) ?? "not set"}
                        </p>
                      </div>
                      <ActionLink to="/receive">View</ActionLink>
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>

            <DashCard icon={<ListIcon />} title="Recent handoffs">
              {handoffs.isLoading ? (
                <Skeleton />
              ) : list.length === 0 ? (
                <p className="text-lg text-faint">No handoffs yet</p>
              ) : (
                <ul className="flex flex-col gap-6">
                  {list.slice(0, 4).map((h) => {
                    const editable = EDITABLE.includes(h.state);
                    return (
                      <li key={h.id} className="flex items-start gap-4">
                        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden>
                          <InboxIcon />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {h.outgoing && h.incoming ? `${h.outgoing.name} → ${h.incoming.name}` : h.id}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {STATE_LABEL[h.state]}
                            {h.status_line?.submitted_at ? ` · Submitted ${formatClock(h.status_line.submitted_at)}` : ""}
                          </p>
                        </div>
                        <ActionLink to={editable ? `/create/${h.id}/${STEP_OF[h.state]?.path ?? "record"}` : `/receive/${h.id}`}>View</ActionLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashCard>
          </div>
        </div>
      </div>

      {/* Floating progress pill for a handoff in progress. */}
      {draft && step && (
        <Link
          to={`/create/${draft.id}/${step.path}`}
          className="fixed bottom-6 right-6 z-20 inline-flex min-h-[56px] items-center gap-4 rounded-full bg-ink px-7 text-lg font-semibold text-white shadow-xl hover:bg-ink/90"
        >
          Handoff in progress
          <span aria-hidden className="h-6 w-px bg-white/50" />
          Step {step.n} of 3
        </Link>
      )}
    </div>
  );
}
