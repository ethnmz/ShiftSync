import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared primitives so every screen uses the same sizes, borders and states.

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90 border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle",
  ghost: "text-muted hover:text-ink hover:bg-subtle border border-transparent",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "min-h-[36px] px-3 text-sm" : size === "lg" ? "min-h-[48px] px-5 text-base" : "min-h-touch px-4 text-sm";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${sz} ${VARIANT[variant]} ${className}`}
    />
  );
}

export type Tone = "neutral" | "accent" | "ok" | "info" | "warn" | "unk" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-muted border-line",
  accent: "bg-accent/10 text-accent border-accent/30",
  ok: "bg-ok/10 text-ok border-ok/30",
  info: "bg-info/10 text-info border-info/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  unk: "bg-unk/10 text-unk border-unk/30",
  danger: "bg-danger/10 text-danger border-danger/30",
};

// Small status chip. Always carries text (and usually an icon), never color alone.
export function Chip({ tone = "neutral", icon, children, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted">
        {children}
      </h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}

// Inline message. `alert` is announced immediately; `status` politely.
export function Notice({
  tone = "neutral",
  role = "status",
  title,
  children,
  action,
}: {
  tone?: Tone;
  role?: "status" | "alert";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon = tone === "danger" ? "✕" : tone === "warn" ? "⚠" : tone === "ok" ? "✓" : tone === "unk" ? "?" : "i";
  return (
    <div role={role} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${TONE[tone]}`}>
      <span aria-hidden className="mt-px font-bold">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-muted" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {label}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-3 animate-pulse rounded bg-subtle" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

// Plane-style properties row: label on the left, value on the right.
export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// Dashboard card pieces (Home and the Create steps share them).
export function Tile({ children }: { children: ReactNode }) {
  return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink">{children}</span>;
}

export function DashCard({
  icon,
  title,
  aside,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-6 sm:p-8 ${className}`}>
      <div className="mb-6 flex items-center gap-4">
        <Tile>{icon}</Tile>
        <h2 className="text-xl font-medium">{title}</h2>
        {aside && <div className="ml-auto text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
