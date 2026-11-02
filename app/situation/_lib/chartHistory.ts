import { isProbability } from "./polymarket";
import type { PricePoint } from "./types";

export const HISTORY_REFRESH_MS = 60_000;
type Load = (token: string, start: number, end: number, fidelity: number) => Promise<PricePoint[] | null>;
type Entry = { points: PricePoint[]; syncedTo: number; attemptedAt: number; touchedAt: number; pending?: Promise<void> };

export function mergeChartHistory(previous: PricePoint[], incoming: PricePoint[], start: number, end: number): PricePoint[] {
  const points = new Map<number, PricePoint>();
  for (const point of [...previous, ...incoming]) {
    if (Number.isFinite(point.t) && isProbability(point.p) && point.t >= start && point.t <= end) points.set(point.t, point);
  }
  return [...points.values()].sort((a, b) => a.t - b.t);
}

export function createChartHistoryCache(load: Load, now = Date.now, limit = 256) {
  const entries = new Map<string, Entry>();
  const keyFor = (token: string, range: string) => `${token}:${range}`;
  function prune() {
    for (const [key, entry] of entries) {
      if (!entry.pending && (entries.size > limit || now() - entry.touchedAt > 10 * 60_000)) entries.delete(key);
    }
  }
  return {
    async get(token: string, range: string, start: number, end: number, fidelity: number): Promise<PricePoint[]> {
      const key = keyFor(token, range);
      prune();
      let entry = entries.get(key);
      if (!entry) {
        entry = { points: [], syncedTo: 0, attemptedAt: -Infinity, touchedAt: now() };
        entries.set(key, entry);
      }
      entry.touchedAt = now();
      entries.delete(key);
      entries.set(key, entry);
      if (!entry.pending && now() - entry.attemptedAt >= HISTORY_REFRESH_MS) {
        entry.attemptedAt = now();
        const target = entry;
        const incremental = target.syncedTo > 0 && end - target.syncedTo <= 15 * 86400;
        const queryStart = incremental ? Math.max(start, target.syncedTo - 120) : start;
        target.pending = (async () => {
          try {
            let incoming = await load(token, queryStart, end, incremental ? 1 : fidelity);
            if (!incremental && incoming?.length === 0 && start > 0) incoming = await load(token, 0, end, fidelity);
            if (incoming !== null) {
              target.points = mergeChartHistory(target.points, incoming, start, end);
              // An empty incremental response may be an upstream hiccup.
              // Retry from the same coverage next minute instead of losing a gap.
              if (!incremental || incoming.length > 0) target.syncedTo = end;
            }
          } finally { target.pending = undefined; }
        })();
      }
      await entry.pending;
      return mergeChartHistory([], entry.points, start, end);
    },
    sample(token: string, range: string, history: PricePoint[], point: PricePoint): PricePoint[] {
      if (!isProbability(point.p) || !Number.isFinite(point.t)) return history;
      const points = [...history];
      const last = points[points.length - 1];
      if (last && Math.floor(last.t / 60) === Math.floor(point.t / 60)) points.pop();
      points.push(point);
      const entry = entries.get(keyFor(token, range));
      if (entry) entry.points = points;
      return points;
    },
  };
}
