import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FlatBody } from "./Flat";
import { mascotLabel, type MascotKind } from "./registry";

// three.js (and the scene) load only when a live mascot first scrolls into view.
const Scene = lazy(() => import("./scene"));

let webglCache: boolean | null = null;
function hasWebGL() {
  if (webglCache === null) {
    try {
      const c = document.createElement("canvas");
      webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noSubscribe = () => () => {};
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Flat stand-in with the same faces: shown while three.js loads, without
// WebGL, and as the first paint.
function Fallback({ kinds, width, height, still }: { kinds: MascotKind[]; width: number; height: number; still: boolean }) {
  const body = Math.min(height * 0.55, (width / kinds.length) * 0.62);
  return (
    <div className="absolute inset-0 flex items-center justify-evenly">
      {kinds.map((k, i) => (
        <FlatBody key={k} kind={k} width={body} bob={!still} delay={i * 0.4} />
      ))}
    </div>
  );
}

// Live glass mascots in 3D for roomy spots (one per page at most). Decorative
// unless `label` is given; rendering pauses while off screen and holds still
// when the viewer prefers reduced motion.
export default function Mascot3D({ kinds, width, height, label, className = "" }: { kinds: MascotKind[]; width: number; height: number; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL);
  const still = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={kinds.map(mascotLabel).join(", ")}
      className={`relative shrink-0 ${className}`}
      style={{ width, height }}
    >
      {!ready && <Fallback kinds={kinds} width={width} height={height} still={still} />}
      {webgl && seen && (
        <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
          <Suspense fallback={null}>
            <Scene kinds={kinds} paused={!visible} still={still} onReady={() => setReady(true)} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
