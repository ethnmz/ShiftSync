import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { DEMO_USERS, useUser } from "../session/user";

// Receive needs a handoff id, so it has no top-level link yet.
const NAV = [
  { to: "/create", label: "Create" },
  { to: "/history", label: "History" },
  { to: "/supervisor", label: "Supervisor" },
  { to: "/evaluation", label: "Evaluation" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, setUser } = useUser();
  const [dark, setDark] = useState(true);

  function toggleTheme() {
    document.documentElement.classList.toggle("dark", !dark);
    setDark(!dark);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-4 py-2 lg:px-6">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold tracking-tight">ShiftSync</span>
          <span className="hidden text-sm text-muted md:inline">
            Less chaos. Clearer communication. Faster handoffs.
          </span>
        </div>

        <nav className="flex flex-1 flex-wrap gap-1">
          <span className="flex min-h-touch items-center rounded-lg px-3 text-sm text-muted" title="Opened from a submitted handoff">
            Receive
          </span>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex min-h-touch items-center rounded-lg px-3 text-sm font-medium ${
                  isActive ? "bg-accent/15 text-accent" : "text-muted hover:text-ink"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted" htmlFor="demo-user">
            Viewing as
          </label>
          <select
            id="demo-user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="min-h-touch rounded-lg border border-line bg-bg px-3 text-sm"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            onClick={toggleTheme}
            className="min-h-touch min-w-touch rounded-lg border border-line px-3 text-sm"
          >
            {dark ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
