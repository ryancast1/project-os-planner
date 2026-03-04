"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SavedView } from "./types";

/* ── Thresholds ──────────────────────────────────────────── */
const WHEEL_THRESHOLD = 150; // accumulated deltaX to trigger switch
const WHEEL_DEBOUNCE_MS = 120; // reset accumulator after idle gap
const TOUCH_DISTANCE_MIN = 60; // min horizontal px for touch swipe
const TOUCH_VELOCITY_MIN = 0.3; // min px/ms for touch swipe
const COOLDOWN_MS = 800; // pause between consecutive switches
const LABEL_DISPLAY_MS = 1500; // toast display duration

/* ── Helpers ─────────────────────────────────────────────── */

function getAdjacentView(
  views: SavedView[],
  activeId: string | null,
  direction: "next" | "prev",
): SavedView | null {
  if (views.length < 2) return null;
  const idx = activeId ? views.findIndex((v) => v.id === activeId) : -1;

  if (direction === "next") {
    if (idx === -1) return views[0];
    if (idx >= views.length - 1) return null; // at end – don't wrap
    return views[idx + 1];
  } else {
    if (idx === -1) return views[views.length - 1];
    if (idx <= 0) return null; // at start – don't wrap
    return views[idx - 1];
  }
}

/* ── Hook ────────────────────────────────────────────────── */

export function useViewSwipe({
  savedViews,
  activeViewId,
  onSwitchView,
  enabled,
}: {
  savedViews: SavedView[];
  activeViewId: string | null;
  onSwitchView: (view: SavedView) => void;
  enabled: boolean;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);

  // Mutable refs for gesture state (avoids stale closures)
  const accDeltaX = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownUntil = useRef(0);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch tracking
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const touchCancelled = useRef(false);

  // Keep latest values in refs so event handlers never read stale state
  const viewsRef = useRef(savedViews);
  viewsRef.current = savedViews;
  const activeIdRef = useRef(activeViewId);
  activeIdRef.current = activeViewId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const doSwitch = useCallback(
    (direction: "next" | "prev") => {
      if (Date.now() < cooldownUntil.current) return;
      const target = getAdjacentView(
        viewsRef.current,
        activeIdRef.current,
        direction,
      );
      if (!target) return;

      cooldownUntil.current = Date.now() + COOLDOWN_MS;
      onSwitchView(target);

      // Show toast
      if (labelTimer.current) clearTimeout(labelTimer.current);
      setTransitionLabel(target.title);
      labelTimer.current = setTimeout(
        () => setTransitionLabel(null),
        LABEL_DISPLAY_MS,
      );
    },
    [onSwitchView],
  );

  /* ── Disable browser back/forward overscroll on this page (Chrome) ── */
  useEffect(() => {
    const html = document.documentElement;
    html.style.overscrollBehaviorX = "none";
    return () => {
      html.style.overscrollBehaviorX = "";
    };
  }, []);

  /* ── Wheel handler (Mac trackpad 2-finger swipe) ────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!enabledRef.current) return;

      // Suppress browser back/forward navigation for ANY horizontal wheel event
      // on this page — must fire before threshold checks so the browser never
      // starts its navigation animation.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 1) {
        e.preventDefault();
      }

      if (viewsRef.current.length < 2) return;

      // Only accumulate predominantly horizontal gestures
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.5) return;
      if (Math.abs(e.deltaX) < 2) return;

      accDeltaX.current += e.deltaX;

      // Debounce: reset accumulator after idle gap
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        accDeltaX.current = 0;
      }, WHEEL_DEBOUNCE_MS);

      // Check threshold
      if (accDeltaX.current > WHEEL_THRESHOLD) {
        doSwitch("next");
        accDeltaX.current = 0;
      } else if (accDeltaX.current < -WHEEL_THRESHOLD) {
        doSwitch("prev");
        accDeltaX.current = 0;
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [doSwitch]);

  /* ── Touch handlers (iPhone landscape 1-finger swipe) ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      if (!enabledRef.current) return;
      if (viewsRef.current.length < 2) return;
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
      touchCancelled.current = false;
    }

    function handleTouchMove(e: TouchEvent) {
      if (touchCancelled.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX.current);
      const dy = Math.abs(touch.clientY - touchStartY.current);
      // If early movement is more vertical, cancel swipe tracking
      if (dy > dx && dy > 10) {
        touchCancelled.current = true;
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!enabledRef.current) return;
      if (touchCancelled.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);
      const absDx = Math.abs(dx);
      const elapsed = Date.now() - touchStartTime.current;
      const velocity = elapsed > 0 ? absDx / elapsed : 0;

      if (
        absDx >= TOUCH_DISTANCE_MIN &&
        absDx > dy * 1.5 &&
        velocity >= TOUCH_VELOCITY_MIN
      ) {
        // Negative dx = finger moved left = next view
        doSwitch(dx < 0 ? "next" : "prev");
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [doSwitch]);

  // Cleanup label timer on unmount
  useEffect(() => {
    return () => {
      if (labelTimer.current) clearTimeout(labelTimer.current);
    };
  }, []);

  return { containerRef, transitionLabel };
}
