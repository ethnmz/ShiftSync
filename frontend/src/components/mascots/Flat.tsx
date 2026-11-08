import { MASCOTS, mascotLabel, type MascotKind } from "./registry";

// Body outline per mascot, in CSS (no three.js). Ported from Harbor's
// MascotFallback: glass gradient, ink eyes, glowing cheeks.
const SHAPES: Record<MascotKind, string> = {
  orbit: "rounded-[50%] aspect-[1.1/0.92]",
  facet: "aspect-[0.8/1] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]",
  murmur: "rounded-[30%] aspect-[1.45/1]",
  nimbus: "rounded-[45%] aspect-[1.5/1]",
  lumen: "rounded-t-full rounded-b-[30%] aspect-[0.75/1]",
  sentry: "rounded-t-[20%] rounded-b-[50%] aspect-[0.85/1]",
};

export function FlatBody({ kind, width, bob = false, delay = 0 }: { kind: MascotKind; width: number; bob?: boolean; delay?: number }) {
  const { color } = MASCOTS[kind];
  return (
    <div
      className={`relative flex items-center justify-center ${SHAPES[kind]} ${bob ? "animate-bob" : ""}`}
      style={{
        width,
        animationDelay: `${delay}s`,
        background: `radial-gradient(120% 90% at 30% 18%, rgba(255,255,255,0.95), rgba(255,255,255,0) 46%), linear-gradient(160deg, ${color}26, ${color}55)`,
        boxShadow: `inset 0 0 0 ${Math.max(1, width / 60)}px rgba(255,255,255,0.85), inset 0 -${width / 8}px ${width / 4}px ${color}40, 0 ${width / 6}px ${width / 3}px -${width / 7}px ${color}88`,
      }}
    >
      <div className="flex flex-col items-center" style={{ gap: width * 0.06 }}>
        <div className="flex" style={{ gap: width * 0.14 }}>
          {[0, 1].map((e) => (
            <span key={e} className="rounded-full bg-[#151515]" style={{ width: Math.max(2, width * 0.075), height: Math.max(3, width * 0.15) }} />
          ))}
        </div>
        <div className="flex" style={{ gap: width * 0.4 }}>
          {[0, 1].map((e) => (
            <span key={e} className="rounded-full blur-[0.5px]" style={{ width: width * 0.11, height: width * 0.06, background: color }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Small static mascot for thread rows and headers. Decorative: the visible
// role text next to it carries the meaning.
export function MascotAvatar({ kind, size = 28 }: { kind: MascotKind; size?: number }) {
  return (
    <span aria-hidden title={mascotLabel(kind)} className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <FlatBody kind={kind} width={size * 0.92} />
    </span>
  );
}

// "ShiftSync AI · Questions" with its mascot: the AI tag used on AI output.
export function AiByline({ kind, size = 28, className = "" }: { kind: MascotKind; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <MascotAvatar kind={kind} size={size} />
      <span className="text-sm font-semibold">
        {MASCOTS[kind].ai === false ? "ShiftSync" : "ShiftSync AI"} <span className="font-normal text-muted">· {MASCOTS[kind].role}</span>
      </span>
    </span>
  );
}
