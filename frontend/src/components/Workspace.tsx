import type { ReactNode } from "react";

// Underlined tab row. Plain buttons with aria-pressed: the panels are swapped
// in place, so this is a view switch rather than navigation.
export function TabBar<T extends string>({ tabs, value, onChange, label, aside }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-line" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px min-h-[48px] border-b-2 text-base font-semibold ${value === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.label}
        </button>
      ))}
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

// Clarify and Review layout: the handoff (transcript or summary) in the middle,
// a docked panel on the right edge. Stacks on small screens.
// `flush` is for pages without the Create flow's side padding (Receive).
export default function Workspace({ main, panelTabs, panel, footer, flush = false }: { main: ReactNode; panelTabs: ReactNode; panel: ReactNode; footer?: ReactNode; flush?: boolean }) {
  const outer = flush ? "" : "-mx-4 mt-6 border-t border-line sm:-mx-10 lg:-mx-14";
  return (
    <div className={`flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] ${outer}`}>
      <div className="min-w-0 px-4 pb-40 pt-6 sm:px-10">
        <div className="mx-auto max-w-3xl">{main}</div>
      </div>
      <aside className="flex flex-col border-t border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-l lg:border-t-0">
        <div className="px-5">{panelTabs}</div>
        <div data-panel-scroll className="flex-1 overflow-y-auto px-5 py-5">
          {panel}
        </div>
        {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
