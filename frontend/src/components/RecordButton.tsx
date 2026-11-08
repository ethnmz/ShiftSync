import { formatTime, useRecorder } from "../hooks/useRecorder";

// Tap to start, tap again to stop. Hands the finished audio/webm Blob to onRecorded.
export default function RecordButton({
  onRecorded,
  disabled,
}: {
  onRecorded: (audio: Blob) => void;
  disabled?: boolean;
}) {
  const { recording, seconds, levels, error, toggle } = useRecorder(onRecorded);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={recording}
        aria-label={recording ? "Stop recording" : "Record end-of-shift note"}
        className={`flex h-36 w-36 items-center justify-center rounded-full text-lg font-semibold text-white shadow-lg ring-8 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
          recording
            ? "animate-pulse bg-red-700 ring-red-500/40"
            : "bg-red-600 ring-red-600/20 hover:bg-red-500"
        }`}
      >
        {recording ? "■ Stop" : "● Record"}
      </button>
      <p className="text-sm text-muted" aria-live="polite">
        {recording ? `Recording · ${formatTime(seconds)}` : "Tap to start, tap again to stop"}
      </p>
      <div className="flex h-10 w-full items-center justify-center gap-[3px] rounded-lg border border-line px-3" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className={`w-1 rounded-full ${recording ? "bg-red-500" : "bg-line"}`}
            style={{ height: `${Math.max(8, l * 100)}%` }}
          />
        ))}
      </div>
      {error && <p className="text-sm text-amber-500">⚠ {error}</p>}
    </div>
  );
}
