// Soft color behind the page so the frosted shell has something to blur.
// Kept faint: it sits behind solid white reading surfaces.
export default function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -right-[12vw] -top-[22vh] size-[62vw] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.18),transparent)]" />
      <div className="absolute -left-[18vw] top-[28vh] size-[52vw] rounded-full bg-[radial-gradient(closest-side,rgb(20_184_166/0.14),transparent)]" />
      <div className="absolute -bottom-[30vh] right-[6vw] size-[56vw] rounded-full bg-[radial-gradient(closest-side,rgb(249_115_22/0.12),transparent)]" />
    </div>
  );
}
