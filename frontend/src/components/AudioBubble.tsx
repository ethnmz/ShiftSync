import { useEffect, useRef, useState } from "react";
import { toBars } from "../hooks/useRecorder";

function mmss(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// Play button + waveform for one recording. Bars come from the levels
// measured while recording; server audio without levels gets a plain
// progress line instead of an invented waveform.
export default function AudioBubble({ src, peaks, label }: { src: string; peaks?: number[]; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = peaks && peaks.length ? toBars(peaks, 56) : null;

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
    setPlaying(!playing);
  }

  return (
    <div className="flex items-center gap-3">
      <audio ref={audio} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-bg"
      >
        <span aria-hidden className="text-[11px]">
          {playing ? "❚❚" : "▶"}
        </span>
      </button>
      {bars ? (
        <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
          {bars.map((b, i) => (
            <span
              key={i}
              className={`w-[2px] flex-1 rounded-full ${i / bars.length < progress ? "bg-ink" : "bg-ink/35"}`}
              style={{ height: `${b * 100}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="relative h-[2px] min-w-0 flex-1 bg-ink/20" aria-hidden>
          <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted">{mmss(duration)}</span>
    </div>
  );
}
