import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared primitives so every screen uses the same sizes, borders and states.

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white shadow-sm hover:bg-ink/85 border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-subtle",
  ghost: "text-muted hover:text-ink hover:bg-subtle border border-transparent",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "min-h-[36px] rounded-[10px] px-3 text-sm" : size === "lg" ? "min-h-[48px] rounded-xl px-6 text-base" : "min-h-touch rounded-xl px-4 text-sm";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${sz} ${VARIANT[variant]} ${className}`}
    />
  );
}

export type Tone = "neutral" | "accent" | "ok" | "info" | "warn" | "unk" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-muted border-transparent",
  accent: "bg-accent/[0.07] text-accent border-accent/20",
  ok: "bg-ok/[0.07] text-ok border-ok/20",
  info: "bg-info/[0.07] text-info border-info/20",
  warn: "bg-warn/[0.07] text-warn border-warn/25",
  unk: "bg-unk/[0.07] text-unk border-unk/20",
  danger: "bg-danger/[0.07] text-danger border-danger/25",
};

// Icon color per tone. Chips carry no fill or border; only the icon is tinted.
const ICON_TONE: Record<Tone, string> = {
  neutral: "text-muted",
  accent: "text-accent",
  ok: "text-ok",
  info: "text-info",
  warn: "text-warn",
  unk: "text-unk",
  danger: "text-danger",
};

// Small status label: plain text plus an icon, no colored pill. It still always
// shows its words, so certainty (Unverified, Unknown) and priority stay visible
// everywhere (CLAUDE.md section 5) without relying on color.
export function Chip({ tone = "neutral", icon, children, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-muted">
      {icon && (
        <span aria-hidden className={ICON_TONE[tone]}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</section>;
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
    <div role={role} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TONE[tone]}`}>
      <span aria-hidden className="mt-px font-semibold">
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
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
      {label}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="shimmer h-3 rounded" style={{ width: `${90 - i * 12}%` }} />
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
  return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">{children}</span>;
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
    <section className={`rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-8 ${className}`}>
      <div className="mb-6 flex items-center gap-4">
        <Tile>{icon}</Tile>
        <h2 className="text-xl font-semibold">{title}</h2>
        {aside && <div className="ml-auto text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// Gray filled fields with a hairline border (Harbor reference). Apply to
// input, textarea and select.
export const fieldClass =
  "w-full rounded-xl border border-line-strong/70 bg-subtle px-4 text-base outline-none transition-colors placeholder:text-faint focus-visible:border-ink/35 focus-visible:bg-surface focus-visible:ring-4 focus-visible:ring-ink/5 disabled:opacity-60";

// Small uppercase field label.
export function Label({ htmlFor, children, className = "" }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`text-xs font-semibold uppercase tracking-[0.04em] text-muted ${className}`}>
      {children}
    </label>
  );
}

// Section card: big radius, generous padding, title, gray subtitle, actions.
// `glass` is for shell-level surfaces only; reading surfaces stay solid.
export function Panel({
  title,
  description,
  actions,
  eyebrow,
  glass = false,
  className = "",
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  glass?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const header = title || description || actions || eyebrow;
  return (
    <section className={`rounded-panel p-6 sm:p-8 ${glass ? "glass" : "border border-line bg-surface shadow-panel"} ${className}`}>
      {header && (
        <div className={`flex flex-wrap items-start justify-between gap-4 ${children ? "mb-6" : ""}`}>
          <div className="min-w-0">
            {eyebrow && <div className="mb-2 text-sm font-medium text-muted">{eyebrow}</div>}
            {title && <h2 className="text-2xl font-semibold">{title}</h2>}
            {description && <div className="mt-1 max-w-3xl leading-relaxed text-muted">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// Gray tile with a big number (Harbor's Stat). `hint` explains the number.
export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  const color = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "";
  return (
    <div className="rounded-2xl bg-subtle px-5 py-4">
      <div className="text-sm font-medium text-ink/80">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
    </div>
  );
}
