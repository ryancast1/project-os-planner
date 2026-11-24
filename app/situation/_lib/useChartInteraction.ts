"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { CHART_MEASURE_EVENT, type ChartRange } from "./chartMeasurement";

export function useChartInteraction({ elementRef, hasHistory, allowHover, timestampAtPosition, onHoverTimeChange }: {
  elementRef: RefObject<HTMLDivElement | null>;
  hasHistory: boolean;
  allowHover: boolean;
  timestampAtPosition: (position: number, snap: boolean) => number | null;
  onHoverTimeChange?: (timestamp: number | null) => void;
}) {
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const [range, setRange] = useState<ChartRange | null>(null);
  const mouse = useRef<{ id: number; x: number; start: number; measuring: boolean } | null>(null);
  const touchMode = useRef<"idle" | "single" | "range" | "blocked">("idle");
  const touchIds = useRef<number[]>([]);
  const reported = useRef<number | null>(null);

  const showHover = useEffectEvent((timestamp: number | null) => {
    setHoverTs(timestamp);
    if (reported.current === timestamp) return;
    reported.current = timestamp;
    onHoverTimeChange?.(timestamp);
  });
  const timestampFor = useEffectEvent((clientX: number, snap: boolean, clamp: boolean) => {
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const position = ((clientX - rect.left) / rect.width - 0.05) / 0.92;
    if (!clamp && (position < 0 || position > 1)) return null;
    return timestampAtPosition(Math.max(0, Math.min(1, position)), snap);
  });
  const showRange = useEffectEvent((start: number | null, end: number | null) => {
    if (start == null || end == null) return;
    const next = { start: Math.min(start, end), end: Math.max(start, end) };
    setRange(current => current?.start === next.start && current.end === next.end ? current : next);
    showHover(next.end);
  });
  const cancel = useEffectEvent(() => {
    const current = mouse.current;
    mouse.current = null;
    touchMode.current = "idle";
    touchIds.current = [];
    setRange(null);
    showHover(null);
    if (current && elementRef.current?.hasPointerCapture(current.id)) elementRef.current.releasePointerCapture(current.id);
  });
  const pointerDown = useEffectEvent((event: PointerEvent) => {
    if (event.pointerType === "touch" || event.button !== 0 || touchMode.current !== "idle") return;
    const start = timestampFor(event.clientX, true, false);
    if (start == null) return;
    mouse.current = { id: event.pointerId, x: event.clientX, start, measuring: false };
    elementRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (allowHover) showHover(timestampFor(event.clientX, false, false));
  });
  const pointerMove = useEffectEvent((event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const current = mouse.current;
    if (current && current.id === event.pointerId) {
      if (!(event.buttons & 1)) { cancel(); return; }
      if (!current.measuring && Math.abs(event.clientX - current.x) < 4) return;
      if (!current.measuring) {
        current.measuring = true;
        elementRef.current?.dispatchEvent(new Event(CHART_MEASURE_EVENT, { bubbles: true }));
      }
      event.preventDefault();
      showRange(current.start, timestampFor(event.clientX, true, true));
    } else if (allowHover) showHover(timestampFor(event.clientX, false, false));
  });
  const pointerUp = useEffectEvent((event: PointerEvent) => {
    const current = mouse.current;
    if (!current || current.id !== event.pointerId) return;
    mouse.current = null;
    setRange(null);
    if (elementRef.current?.hasPointerCapture(current.id)) elementRef.current.releasePointerCapture(current.id);
    showHover(allowHover ? timestampFor(event.clientX, false, false) : null);
  });
  const pointerLeave = useEffectEvent(() => { if (!mouse.current && touchMode.current === "idle") showHover(null); });
  const pointerCancel = useEffectEvent((event: PointerEvent) => {
    if (event.pointerId === mouse.current?.id) cancel();
  });
  const updateTouches = useEffectEvent((event: TouchEvent) => {
    const touches = Array.from(event.touches);
    const tracked = touchIds.current.map(id => touches.find(touch => touch.identifier === id));
    if (tracked.length !== 2 || !tracked[0] || !tracked[1]) return;
    showRange(timestampFor(tracked[0].clientX, true, true), timestampFor(tracked[1].clientX, true, true));
  });
  const touchStart = useEffectEvent((event: TouchEvent) => {
    const touches = Array.from(event.touches);
    if (touchMode.current === "blocked") return;
    const expanded = elementRef.current?.closest("[data-hold-preview='true']")?.getBoundingClientRect();
    const belongsToChart = (touch: Touch) => (touch.target instanceof Node && elementRef.current?.contains(touch.target))
      // A held needle can become a chart while the first finger is still down.
      || (expanded && touch.clientX >= expanded.left && touch.clientX <= expanded.right && touch.clientY >= expanded.top && touch.clientY <= expanded.bottom);
    if (touches.length === 2 && touches.every(belongsToChart)) {
      touchMode.current = "range";
      touchIds.current = touches.map(touch => touch.identifier);
      elementRef.current?.dispatchEvent(new Event(CHART_MEASURE_EVENT, { bubbles: true }));
      event.preventDefault();
      event.stopPropagation();
      updateTouches(event);
    } else if (touches.length === 1 && touchMode.current !== "range") {
      touchMode.current = "single";
      if (allowHover) showHover(timestampFor(touches[0].clientX, false, false));
    } else {
      cancel();
      touchMode.current = "blocked";
    }
  });
  const touchMove = useEffectEvent((event: TouchEvent) => {
    if (touchMode.current === "range" && event.touches.length === 2) {
      event.preventDefault();
      event.stopPropagation();
      updateTouches(event);
    } else if (touchMode.current === "single" && event.touches.length === 1 && allowHover) {
      event.preventDefault();
      showHover(timestampFor(event.touches[0].clientX, false, false));
    }
  });
  const touchEnd = useEffectEvent((event: TouchEvent) => {
    if (touchMode.current === "range" || touchMode.current === "blocked") {
      event.preventDefault();
      event.stopPropagation();
    }
    setRange(null);
    showHover(null);
    touchIds.current = [];
    // Lifting one finger must not turn the remainder into a swipe or a new scrub.
    touchMode.current = event.touches.length ? "blocked" : "idle";
  });
  const keyDown = useEffectEvent((event: KeyboardEvent) => { if (event.key === "Escape") cancel(); });
  const visibility = useEffectEvent(() => { if (document.hidden) cancel(); });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !hasHistory) return;
    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", pointerMove);
    element.addEventListener("pointerleave", pointerLeave);
    element.addEventListener("lostpointercapture", pointerCancel);
    element.addEventListener("touchstart", touchStart, { passive: false });
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("touchend", touchEnd, { passive: false });
    element.addEventListener("touchcancel", touchEnd, { passive: false });
    window.addEventListener("pointerup", pointerUp, true);
    window.addEventListener("pointercancel", pointerCancel, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", keyDown);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      element.removeEventListener("pointerdown", pointerDown);
      element.removeEventListener("pointermove", pointerMove);
      element.removeEventListener("pointerleave", pointerLeave);
      element.removeEventListener("lostpointercapture", pointerCancel);
      element.removeEventListener("touchstart", touchStart);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("touchend", touchEnd);
      element.removeEventListener("touchcancel", touchEnd);
      window.removeEventListener("pointerup", pointerUp, true);
      window.removeEventListener("pointercancel", pointerCancel, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", keyDown);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [elementRef, hasHistory]);

  return { hoverTs, range };
}
