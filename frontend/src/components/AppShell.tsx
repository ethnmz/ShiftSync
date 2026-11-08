import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FIXTURE_MODE } from "../api/client";
import { DEMO_USERS, useUser } from "../session/user";
import { ChartIcon, ClockIcon, HomeIcon, InboxIcon, PeopleIcon, PlusCircleIcon } from "./icons";

// Built screens only. History, Supervisor and Evaluation are P1 in
// docs/PRODUCT.md and are listed as not built rather than linked.
const HANDOFFS = [
  { to: "/", label: "Home", icon: <HomeIcon />, end: true },
  { to: "/create", label: "New handoff", icon: <PlusCircleIcon /> },
  { to: "/receive", label: "Receive", icon: <InboxIcon /> },
];
const LATER = [
  { label: "History", icon: <ClockIcon /> },
  { label: "Supervisor", icon: <PeopleIcon /> },
  { label: "Evaluation", icon: <ChartIcon /> },
];

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, setUser } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1">
        <span className="text-[26px] font-bold tracking-tighter">shiftsync.</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent" aria-hidden>
          {initials(user.name)}
        </span>
      </div>

      {/* Workspace block: who is using the demo and on which shift. */}
      <div className="mt-6 flex items-center gap-3 px-1">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted" aria-hidden>
          <PeopleIcon />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">{user.team ? `${user.team[0].toUpperCase()}${user.team.slice(1)} shift` : "All shifts"}</p>
          <label htmlFor="demo-user" className="sr-only">
            Demo user (not sign-in)
          </label>
          <select
            id="demo-user"
            value={user.id}
            onChange={(e) => setUser(e.target.value)}
            className="-ml-1 max-w-full rounded-md bg-transparent px-1 text-base font-medium hover:bg-subtle"
            title="Demo user, not sign-in"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
        </div>
      </div>
      <hr className="mx-1 mt-5 border-line" />

      <nav aria-label="Main" className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto">
        <p className="px-1 pb-2 text-sm uppercase tracking-wide text-muted">Handoffs</p>
        {HANDOFFS.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-[15px] ${isActive ? "bg-subtle font-semibold text-ink" : "text-ink/85 hover:bg-subtle"}`
            }
          >
            {n.icon}
            {n.label}
          </NavLink>
        ))}
        <p className="px-1 pb-2 pt-5 text-sm uppercase tracking-wide text-muted">Not built yet</p>
        {LATER.map((l) => (
          <span key={l.label} aria-disabled="true" className="flex min-h-[44px] items-center gap-3 px-3 text-[15px] text-faint">
            {l.icon}
            {l.label}
            <span className="rounded-full border border-line px-2 text-xs">P1</span>
          </span>
        ))}
      </nav>

      <hr className="mx-1 border-line" />
      <div className="mt-4 px-1">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${FIXTURE_MODE ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"}`}
          title={FIXTURE_MODE ? "No backend. Scripted fixtures replay demo/scenario.json." : "Calling the FastAPI backend at /api"}
        >
          {FIXTURE_MODE ? "Offline demo data" : "Live API"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 border-r border-line bg-surface px-5 py-6 md:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden">
          <span className="text-xl font-bold tracking-tighter">shiftsync.</span>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="min-h-touch rounded-lg border border-line-strong px-4 text-sm font-medium"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </header>
        {menuOpen && (
          <div id="mobile-menu" className="border-b border-line bg-surface px-4 py-4 md:hidden">
            {sidebar}
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// Page title row shared by inner screens.
export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface px-4 py-4 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
