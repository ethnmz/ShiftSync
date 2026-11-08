import type { ReactNode } from "react";

// Underlined tab row. Plain buttons with aria-pressed: the panels are swapped
// in place, so this is a view switch rather than navigation.
export function TabBar<T extends string>({ tabs, value, onChange, label, aside }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-ink/10" role="group" aria-label={label}>
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

// Clarify, Review and Receive layout: the handoff (transcript or summary) on a
// solid white card in the middle, and a floating glass panel on the right.
// Stacks on small screens. `flush` is for pages without the Create flow's
// side padding (Receive), so it adds its own.
export default function Workspace({ main, panelTabs, panel, footer, flush = false }: { main: ReactNode; panelTabs: ReactNode; panel: ReactNode; footer?: ReactNode; flush?: boolean }) {
  const outer = flush ? "px-4 sm:px-10 lg:px-14" : "mt-6";
  return (
    <div className={`flex flex-1 flex-col gap-6 pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start ${outer}`}>
      <div className="min-w-0 rounded-panel border border-line bg-surface px-5 pb-10 pt-4 shadow-panel sm:px-8">
        <div className="mx-auto max-w-3xl">{main}</div>
      </div>
      <aside className="glass flex flex-col rounded-panel lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="px-5">{panelTabs}</div>
        <div data-panel-scroll className="flex-1 overflow-y-auto px-5 py-5">
          {panel}
        </div>
        {footer && <div className="border-t border-line/70 px-5 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
