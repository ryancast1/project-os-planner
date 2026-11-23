"use client";

import { useEffect, useRef } from "react";

export default function TaskDivider({ active, compact, onToggle }: {
  active: boolean;
  compact?: boolean;
  onToggle: () => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  const touch = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastPointerType = useRef("");
  const toggleRef = useRef(onToggle);
  useEffect(() => { toggleRef.current = onToggle; }, [onToggle]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function cancelHold() {
    window.clearTimeout(timer.current);
    touch.current = null;
  }

  return (
    <button
      type="button"
      aria-label="Task divider"
      aria-pressed={active}
      title={active ? "Double-click to remove divider" : "Double-click to add divider"}
      className={`group/divider absolute inset-x-0 -top-px z-10 grid -translate-y-1/2 touch-manipulation place-items-center focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-400 ${compact ? "h-2" : "h-3"}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!event.isPrimary || event.button !== 0) return;
        lastPointerType.current = event.pointerType;
        if (event.pointerType !== "touch") return;
        cancelHold();
        touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        timer.current = window.setTimeout(() => {
          touch.current = null;
          toggleRef.current();
        }, 500);
      }}
      onPointerMove={(event) => {
        const start = touch.current;
        if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onLostPointerCapture={cancelHold}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail === 0) onToggle();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (lastPointerType.current !== "touch") onToggle();
      }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none w-full ${active
          ? "h-[5px] border-y border-neutral-600 bg-neutral-900"
          : "h-px bg-transparent group-hover/divider:bg-neutral-500 group-active/divider:bg-neutral-500"
        }`}
      />
    </button>
  );
}
