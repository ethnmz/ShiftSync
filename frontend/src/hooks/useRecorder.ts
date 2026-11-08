import { useEffect, useRef, useState } from "react";

const BARS = 32;

export function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// MediaRecorder with a live level meter. Calls onRecorded with the finished Blob.
export function useRecorder(onRecorded: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  useEffect(() => () => cleanupRef.current?.(), []);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone not available. Type your answer instead.");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () =>
      onRecordedRef.current(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);

    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(bins);
      setLevels(Array.from({ length: BARS }, (_, i) => bins[i % bins.length] / 255));
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
    setRecording(true);
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setRecording(false);
  }

  return { recording, seconds, levels, error, toggle: recording ? stop : start };
}
