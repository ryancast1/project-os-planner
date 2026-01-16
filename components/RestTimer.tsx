"use client";

import { useEffect, useRef, useState } from "react";

function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RestTimer({ initialSeconds = 90 }: { initialSeconds?: number }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const endAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;

    // Use an "end time" so it stays accurate even if the browser throttles timers.
    endAtRef.current = Date.now() + secondsLeft * 1000;

    const id = window.setInterval(() => {
      const endAt = endAtRef.current;
      if (!endAt) return;

      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        setRunning(false);
        endAtRef.current = null;
      }
    }, 200);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function start() {
    if (secondsLeft <= 0) setSecondsLeft(initialSeconds);
    setRunning(true);
  }

  function pause() {
    // recompute secondsLeft from endAt
    const endAt = endAtRef.current;
    if (endAt) {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }
    setRunning(false);
    endAtRef.current = null;
  }

  function reset() {
    setRunning(false);
    endAtRef.current = null;
    setSecondsLeft(initialSeconds);
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-center text-xs text-white/60">Rest timer</div>
      <div className="mt-1 text-center text-4xl font-semibold tabular-nums">
        {formatMMSS(secondsLeft)}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <button
          onClick={start}
          disabled={running}
          className="h-12 rounded-xl bg-white text-black font-semibold disabled:opacity-60"
        >
          Start
        </button>
        <button
          onClick={pause}
          disabled={!running}
          className="h-12 rounded-xl border border-white/10 bg-black/20 text-white font-semibold disabled:opacity-60"
        >
          Pause
        </button>
        <button
          onClick={reset}
          className="h-12 rounded-xl border border-white/10 bg-black/20 text-white font-semibold"
        >
          Reset
        </button>
      </div>
    </section>
  );
}