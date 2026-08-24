"use client";

import { useEffect, useRef, useState } from "react";

export default function LongPressTitle({ title, className }: { title: string; className: string }) {
  const [showFullTitle, setShowFullTitle] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  function clearPressTimer() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function beginPress() {
    clearPressTimer();
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setShowFullTitle(true);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShowFullTitle(false), 3000);
    }, 550);
  }

  useEffect(() => () => {
    clearPressTimer();
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  return (
    <>
      <div
        title={title}
        className={className}
        onPointerDown={beginPress}
        onPointerUp={clearPressTimer}
        onPointerCancel={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          if (!longPressed.current) return;
          event.stopPropagation();
          longPressed.current = false;
        }}
      >
        {title}
      </div>
      {showFullTitle ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 mx-auto max-w-lg rounded-2xl border border-white/15 bg-zinc-900/95 px-4 py-3 text-center text-base font-semibold leading-6 text-white shadow-2xl backdrop-blur">
          {title}
        </div>
      ) : null}
    </>
  );
}
