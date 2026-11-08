import type { FactPatch, Item } from "../api/types";
import FactRow from "./FactRow";

const PRIORITY = {
  critical: { bar: "bg-red-500", label: "Critical", text: "text-red-400" },
  important: { bar: "bg-amber-500", label: "Important", text: "text-amber-500" },
  routine: { bar: "bg-line", label: "Routine", text: "text-muted" },
} as const;

export default function EquipmentCard({
  item,
  editable,
  busyFactId,
  onPatch,
}: {
  item: Item;
  editable: boolean;
  busyFactId: string | null;
  onPatch: (factId: string, patch: FactPatch) => void;
}) {
  const p = PRIORITY[item.priority];
  const body = (
    <ul className="px-3 pb-1">
      {item.facts.map((f) => (
        <FactRow key={f.id} fact={f} itemTitle={item.title} editable={editable} busy={busyFactId === f.id} onPatch={(patch) => onPatch(f.id, patch)} />
      ))}
    </ul>
  );
  const header = (
    <div className="flex flex-wrap items-baseline gap-x-2 px-3 pt-2">
      <span className="font-semibold">{item.title}</span>
      {item.asset_ids.map((a) => (
        <span key={a} className="rounded bg-line px-1.5 text-xs font-mono">
          {a}
        </span>
      ))}
      <span className={`ml-auto text-xs font-semibold uppercase ${p.text}`}>{p.label}</span>
    </div>
  );

  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-bg pl-1.5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${p.bar}`} aria-hidden />
      {item.priority === "routine" ? (
        <details>
          <summary className="flex min-h-touch cursor-pointer list-none flex-col justify-center pb-2">{header}</summary>
          {body}
        </details>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </article>
  );
}
