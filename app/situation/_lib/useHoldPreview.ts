"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import { HOLD_PREVIEW_DELAY_MS, HOLD_PREVIEW_EVENT, movedBeforeHold } from "./holdPreview";

export function useHoldPreview(enabled: boolean, identity: string) {
  const elementRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; expanded: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const [active, setActive] = useState(false);

  const finish = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    gesture.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const release = (event: globalThis.PointerEvent) => {
      if (event.pointerId === gesture.current?.id) finish();
    };
    const otherFinger = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch" && gesture.current && event.pointerId !== gesture.current.id) finish();
    };
    const hide = () => { if (document.hidden) finish(); };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("pointerdown", otherFinger, true);
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", hide);
    return () => {
      finish();
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("pointerdown", otherFinger, true);
      window.removeEventListener("blur", finish);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enabled, identity, finish]);

  function onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (!enabled || event.pointerType !== "touch" || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("button, select, input, textarea, a, [role='button']")) return;
    finish();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, expanded: false };
    timer.current = setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.expanded = true;
      suppressClick.current = true;
      setActive(true);
      // Consume this gesture so lifting after a peek cannot also switch views.
      elementRef.current?.dispatchEvent(new Event(HOLD_PREVIEW_EVENT, { bubbles: true }));
    }, HOLD_PREVIEW_DELAY_MS);
  }

  function onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current && current.id === event.pointerId && !current.expanded && movedBeforeHold(current.x, current.y, event.clientX, event.clientY)) finish();
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return { active: enabled && active, elementRef, onPointerDownCapture, onPointerMoveCapture, onClickCapture,
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerId === gesture.current?.id) finish(); },
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => { if (enabled) event.preventDefault(); } };
}
