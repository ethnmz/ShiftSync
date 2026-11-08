import type { ReactNode } from "react";

export default function Panel({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm text-accent">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
