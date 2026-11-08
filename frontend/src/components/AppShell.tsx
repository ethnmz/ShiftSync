import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FIXTURE_MODE } from "../api/client";
import { DEMO_USERS, useUser } from "../session/user";
import { applyTheme, readTheme } from "../theme";

// Built screens only. History, Supervisor and Evaluation are P1 in
// docs/PRODUCT.md and are listed as not built rather than linked.
const NAV = [
  { to: "/create", label: "New handoff", icon: "＋" },
  { to: "/receive", label: "Receive", icon: "↘" },
];
const LATER = ["History", "Supervisor", "Evaluation"];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, setUser } = useUser();
  const [theme, setTheme] = useState(readTheme);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => applyTheme(theme), [theme]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex min-h-[40px] items-center gap-2.5 rounded-md px-2.5 text-sm font-medium ${
              isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-ink"
            }`
          }
        >
          <span aria-hidden className="w-4 text-center">
            {n.icon}
          </span>
          {n.label}
        </NavLink>
      ))}
      <p className="mt-4 px-2.5 text-xs font-semibold uppercase tracking-wide text-faint">Not built yet (P1)</p>
      {LATER.map((l) => (
        <span key={l} className="flex min-h-[36px] items-center gap-2.5 px-2.5 text-sm text-faint" aria-disabled="true">
          <span aria-hidden className="w-4 text-center">·</span>
          {l}
        </span>
      ))}
    </nav>
  );

  const footer = (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="demo-user" className="px-0.5 text-xs font-medium text-muted">
          Demo user <span className="text-faint">(not sign-in)</span>
        </label>
        <select
          id="demo-user"
          value={user.id}
          onChange={(e) => setUser(e.target.value)}
          className="min-h-[40px] rounded-md border border-line-strong bg-surface px-2 text-sm"
        >
          {DEMO_USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role}
              {u.team ? `, ${u.team} shift` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
            FIXTURE_MODE ? "border-warn/30 bg-warn/10 text-warn" : "border-ok/30 bg-ok/10 text-ok"
          }`}
          title={FIXTURE_MODE ? "No backend. Scripted fixtures replay demo/scenario.json." : "Calling the FastAPI backend at /api"}
        >
          {FIXTURE_MODE ? "Offline demo data" : "Live API"}
        </span>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="min-h-[36px] rounded-md border border-line-strong px-2.5 text-xs font-medium text-muted hover:text-ink"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </div>
    </div>
  );

  const brand = (
    <div className="flex flex-col">
      <span className="text-base font-bold tracking-tight">ShiftSync</span>
      <span className="text-xs text-faint">Less chaos. Clearer communication. Faster handoffs.</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="px-2.5">{brand}</div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden">
          {brand}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="min-h-touch min-w-touch rounded-md border border-line-strong text-sm"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </header>
        {menuOpen && (
          <div id="mobile-menu" className="flex flex-col gap-4 border-b border-line bg-surface px-4 py-3 md:hidden">
            {nav}
            {footer}
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// Page title row shared by every screen.
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
