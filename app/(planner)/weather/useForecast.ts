"use client";

import { useEffect, useState } from "react";
import { fetchForecast, type Forecast } from "@/lib/weather";

export function useForecast() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let lastSuccess = 0;
    async function refresh() {
      if (pending || Date.now() - lastSuccess < 15 * 60_000) return;
      pending = true;
      try {
        const data = await fetchForecast(controller.signal);
        if (!controller.signal.aborted) {
          setForecast(data);
          setFailed(false);
          lastSuccess = Date.now();
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally { pending = false; }
    }
    void refresh();
    const interval = window.setInterval(refresh, 15 * 60_000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [attempt]);
  function retry() {
    setFailed(false);
    setAttempt(n => n + 1);
  }
  return { forecast, failed, retry };
}
