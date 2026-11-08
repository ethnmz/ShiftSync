import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { FIXTURE_MODE } from "../api/client";
import { DEMO_USERS, useUser } from "../session/user";
import AmbientGlow from "./ambient";
import { ChartIcon, ClockIcon, DemoIcon, HomeIcon, InboxIcon, Logo, PeopleIcon, PlusCircleIcon } from "./icons";

// Built screens only. History, Supervisor and Evaluation are P1 in
// docs/PRODUCT.md and are shown as not built rather than linked.
const HANDOFFS = [
  { to: "/", label: "Home", icon: <HomeIcon />, end: true },
  { to: "/create", label: "New", title: "New handoff", icon: <PlusCircleIcon /> },
  { to: "/receive", label: "Receive", icon: <InboxIcon /> },
  // Presenter control for the backend's scripted replay; live mode only.
  ...(FIXTURE_MODE ? [] : [{ to: "/demo", label: "Demo", title: "Demo control", icon: <DemoIcon /> }]),
];
const LATER = [
  { label: "History", icon: <ClockIcon /> },
  { label: "Supervisor", icon: <PeopleIcon /> },
  { label: "Evaluation", icon: <ChartIcon /> },
];

function sectionOf(path: string) {
  if (path.startsWith("/create")) return "New handoff";
  if (path.startsWith("/receive")) return "Receive";
  if (path.startsWith("/demo")) return "Demo control";
  if (path === "/") return "Home";
  return "ShiftSync";
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

// One rail entry: a 48px icon tile with a short label under it. Labels stay
// visible (not hover-only) so the rail works on touch and for tired eyes.
function RailItem({ to, label, title, icon, end, horizontal }: { to: string; label: string; title?: string; icon: ReactNode; end?: boolean; horizontal?: boolean }) {
  return (
    <NavLink to={to} end={end} title={title ?? label} className={`group flex shrink-0 flex-col items-center gap-1 ${horizontal ? "w-16" : "w-full"}`}>
      {({ isActive }) => (
        <>
          <span
            className={`flex size-12 items-center justify-center rounded-xl transition-colors ${
              isActive ? "bg-white text-ink shadow-lift ring-1 ring-black/5" : "text-ink/55 group-hover:bg-white/60 group-hover:text-ink"
            }`}
          >
            {icon}
          </span>
          <span className={`text-xs ${isActive ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function LaterItem({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <span aria-disabled="true" title={`${label}: not built yet (P1)`} className="flex w-full flex-col items-center gap-1 text-faint/70">
      <span className="flex size-12 items-center justify-center rounded-xl">{icon}</span>
      <span className="text-xs">{label}</span>
    </span>
  );
}

// Demo identity switcher (not sign-in): initials tile plus a native select.
function UserSwitch() {
  const { user, setUser } = useUser();
  return (
    <div className="glass flex h-12 items-center gap-3 rounded-xl pl-1.5 pr-2">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-white">
        {initials(user.name)}
      </span>
      <label htmlFor="demo-user" className="sr-only">
        Demo user (not sign-in)
      </label>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs text-muted">{user.team ? `${user.team[0].toUpperCase()}${user.team.slice(1)} shift` : "All shifts"}</span>
        <select
          id="demo-user"
          value={user.id}
          onChange={(e) => setUser(e.target.value)}
          title="Demo user, not sign-in"
          className="-ml-0.5 max-w-[11rem] cursor-pointer bg-transparent text-sm font-semibold outline-none"
        >
          {DEMO_USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen">
      <AmbientGlow />

      {/* Floating glass rail (desktop). */}
      <aside className="relative z-40 hidden w-[104px] shrink-0 md:block">
        <div className="glass-rail sticky top-3 m-3 flex h-[calc(100vh-24px)] flex-col items-center rounded-rail px-2 py-5">
          <NavLink to="/" aria-label="ShiftSync home" className="mb-7">
            <Logo size={44} />
          </NavLink>
          <nav aria-label="Main" className="flex w-full flex-col items-center gap-4">
            {HANDOFFS.map((n) => (
              <RailItem key={n.to} {...n} />
            ))}
          </nav>
          <div className="mt-auto flex w-full flex-col items-center gap-3" aria-label="Not built yet">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Later</span>
            {LATER.map((l) => (
              <LaterItem key={l.label} {...l} />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: the same rail, horizontal and sticky. */}
        <div className="glass-rail sticky top-0 z-40 flex items-center gap-2 overflow-x-auto rounded-none border-x-0 border-t-0 px-3 py-2 md:hidden">
          <NavLink to="/" aria-label="ShiftSync home" className="mr-1 shrink-0">
            <Logo size={36} />
          </NavLink>
          <nav aria-label="Main" className="flex gap-1">
            {HANDOFFS.map((n) => (
              <RailItem key={n.to} {...n} horizontal />
            ))}
          </nav>
        </div>

        <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-10 md:pt-5 lg:px-14">
          <p className="text-sm font-medium text-muted">
            Handoffs <span aria-hidden>/</span> <span className="text-ink">{sectionOf(pathname)}</span>
          </p>
          <UserSwitch />
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// Page title row shared by inner screens (Receive). Sits on the canvas.
export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-6 pt-4 sm:px-10 lg:px-14">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
