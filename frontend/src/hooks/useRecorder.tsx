import { useEffect, useRef, useState } from "react";

const BARS = 40;

export function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type RecorderError = "unsupported" | "denied" | "no_device" | "failed";

export const RECORDER_ERROR_TEXT: Record<RecorderError, string> = {
  unsupported: "Voice recording isn't supported in this browser. Type the handoff instead.",
  denied: "Microphone access is blocked. Allow it in the browser's site settings, or type instead.",
  no_device: "No microphone was found. Type the handoff instead.",
  failed: "The microphone couldn't start. Try again, or type instead.",
};

export function recordingSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

// MediaRecorder with a level meter driven by the real input signal.
// finish() hands the Blob to onRecorded; cancel() discards it. Audio stays
// in memory only; nothing is written to browser storage.
export function useRecorder(onRecorded: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<RecorderError | null>(recordingSupported() ? null : "unsupported");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const keepRef = useRef(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  useEffect(
    () => () => {
      keepRef.current = false;
      recorderRef.current?.stop();
      cleanupRef.current?.();
    },
    [],
  );

  async function start() {
    if (!recordingSupported()) {
      setError("unsupported");
      return;
    }
    setError(null);
    setStarting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "no_device" : "failed");
      setStarting(false);
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    keepRef.current = true;
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      if (keepRef.current && chunks.length) onRecordedRef.current(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      setLevels(Array.from({ length: BARS }, (_, i) => bins[Math.floor((i / BARS) * bins.length * 0.6)] / 255));
      frame = requestAnimationFrame(draw);
    };
    draw();

    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    cleanupRef.current = () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();
      setLevels(Array(BARS).fill(0));
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setStarting(false);
    setRecording(true);
  }

  function stop(keep: boolean) {
    keepRef.current = keep;
    recorderRef.current?.stop();
    recorderRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setRecording(false);
  }

  return {
    supported: recordingSupported(),
    recording,
    starting,
    seconds,
    levels,
    error,
    start,
    finish: () => stop(true),
    cancel: () => stop(false),
    clearError: () => setError(recordingSupported() ? null : "unsupported"),
  };
}

// A strip of bars that follows the real microphone level.
export function LevelMeter({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <div className="flex h-8 items-center gap-[2px]" aria-hidden>
      {levels.map((l, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${active ? "bg-danger" : "bg-line-strong"}`}
          style={{ height: `${Math.max(10, Math.min(100, l * 130))}%` }}
        />
      ))}
    </div>
  );
}
