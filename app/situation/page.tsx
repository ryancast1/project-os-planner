"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

// -- Types --
type PricePoint = { t: number; p: number };

type Outcome = {
  name: string;
  tokenId: string;
  currentPrice: number;
  history: PricePoint[];
};

type MarketInfo = {
  title: string;
  outcomes: Outcome[];
};

// -- Constants --
const PROXY = "/situation/api";
const REFRESH_INTERVAL_MS = 12_000;

const TIME_RANGES = [
  { label: "1H", seconds: 3600 },
  { label: "4H", seconds: 4 * 3600 },
  { label: "1D", seconds: 24 * 3600 },
  { label: "1W", seconds: 7 * 24 * 3600 },
  { label: "1M", seconds: 30 * 24 * 3600 },
  { label: "3M", seconds: 90 * 24 * 3600 },
  { label: "All", seconds: 0 },
] as const;

type TimeRangeLabel = (typeof TIME_RANGES)[number]["label"];

function getStartTs(label: TimeRangeLabel): number {
  const range = TIME_RANGES.find((r) => r.label === label)!;
  if (range.seconds === 0) return 0; // "All" — API will use its own start
  return Math.floor(Date.now() / 1000) - range.seconds;
}

function getFidelity(label: TimeRangeLabel): number {
  switch (label) {
    case "1H":
    case "4H":
      return 1;
    case "1D":
      return 5;
    case "1W":
      return 30;
    case "1M":
      return 60;
    case "3M":
    case "All":
      return 360;
  }
}

const COLORS = [
  "rgba(0, 200, 83, 0.95)",
  "rgba(59, 130, 246, 0.95)",
  "rgba(251, 191, 36, 0.95)",
  "rgba(239, 68, 68, 0.95)",
  "rgba(168, 85, 247, 0.95)",
  "rgba(236, 72, 153, 0.95)",
  "rgba(20, 184, 166, 0.95)",
  "rgba(249, 115, 22, 0.95)",
];

// -- Helpers --
function extractSlug(input: string): string | null {
  // Handle full URLs like polymarket.com/event/some-slug or just the slug
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/polymarket\.com\/event\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];
  // If it looks like a bare slug (no spaces, no dots except in domain)
  if (/^[\w-]+$/.test(trimmed)) return trimmed;
  return null;
}

// -- API Functions --
async function fetchEvent(slug: string): Promise<MarketInfo | null> {
  try {
    const res = await fetch(`${PROXY}?endpoint=event&slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const event = data[0];
    if (!event?.markets?.length) return null;

    const title: string = event.title ?? slug;

    // Filter to active (non-closed) markets with nonzero Yes price
    type GammaMarket = {
      question?: string;
      outcomes?: string | string[];
      outcomePrices?: string | string[];
      clobTokenIds?: string | string[];
      closed?: boolean;
      groupItemTitle?: string;
    };

    const activeMarkets = event.markets.filter((m: GammaMarket) => {
      if (m.closed) return false;
      const prices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices ?? [];
      const yesPrice = parseFloat(prices[0] ?? "0");
      return yesPrice > 0.005;
    });

    if (activeMarkets.length === 0) return null;

    // Single market event (simple Yes/No binary)
    if (activeMarkets.length === 1) {
      const m = activeMarkets[0] as GammaMarket;
      const tokenIds =
        typeof m.clobTokenIds === "string"
          ? JSON.parse(m.clobTokenIds)
          : m.clobTokenIds ?? [];
      const outcomes: Outcome[] = [
        { name: "Yes", tokenId: tokenIds[0], currentPrice: 0, history: [] },
        { name: "No", tokenId: tokenIds[1], currentPrice: 0, history: [] },
      ];
      return { title: m.question ?? title, outcomes };
    }

    // Multi-market event — each sub-market's YES token is one outcome
    const outcomes: Outcome[] = activeMarkets.map((m: GammaMarket) => {
      const tokenIds =
        typeof m.clobTokenIds === "string"
          ? JSON.parse(m.clobTokenIds)
          : m.clobTokenIds ?? [];
      const name =
        m.groupItemTitle ??
        (m.question ?? "").replace(/^Will (the )?/i, "").replace(/\?$/, "").replace(/ win .+$/, "");
      return { name, tokenId: tokenIds[0], currentPrice: 0, history: [] };
    });

    // Sort by current price descending (from outcomePrices)
    const priceMap = new Map<string, number>();
    activeMarkets.forEach((m: GammaMarket) => {
      const tokenIds =
        typeof m.clobTokenIds === "string"
          ? JSON.parse(m.clobTokenIds)
          : m.clobTokenIds ?? [];
      const prices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices ?? [];
      priceMap.set(tokenIds[0], parseFloat(prices[0] ?? "0"));
    });
    outcomes.sort((a, b) => (priceMap.get(b.tokenId) ?? 0) - (priceMap.get(a.tokenId) ?? 0));

    return { title, outcomes };
  } catch {
    return null;
  }
}

async function fetchPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${PROXY}?endpoint=price&token_id=${tokenId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === "string"
      ? parseFloat(data.price)
      : (data.price ?? null);
  } catch {
    return null;
  }
}

async function fetchPriceHistory(
  tokenId: string,
  startTs: number,
  endTs: number,
  fidelity: number = 1
): Promise<PricePoint[]> {
  try {
    const params = startTs > 0
      ? `&startTs=${startTs}&endTs=${endTs}&fidelity=${fidelity}`
      : `&interval=max&fidelity=${fidelity}`;
    const res = await fetch(
      `${PROXY}?endpoint=history&market=${tokenId}${params}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.history ?? []) as PricePoint[];
  } catch {
    return [];
  }
}

// -- Main Component --
export default function PolymarketPage() {
  const [urlInput, setUrlInput] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeLabel>("1D");
  const outcomesRef = useRef<Outcome[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRangeRef = useRef<TimeRangeLabel>("1D");

  const refreshData = useCallback(
    async (current: Outcome[], range: TimeRangeLabel) => {
      const now = Math.floor(Date.now() / 1000);
      const startTs = getStartTs(range);
      const fidelity = getFidelity(range);
      const updated = await Promise.all(
        current.map(async (o) => {
          const [price, history] = await Promise.all([
            fetchPrice(o.tokenId),
            fetchPriceHistory(o.tokenId, startTs, now, fidelity),
          ]);
          return {
            ...o,
            currentPrice: price ?? o.currentPrice,
            history: history.length > 0 ? history : o.history,
          };
        })
      );
      outcomesRef.current = updated;
      setOutcomes(updated);
    },
    []
  );

  // Load market when slug changes
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      setMarket(null);
      setOutcomes([]);

      const info = await fetchEvent(slug!);
      if (cancelled) return;
      if (!info) {
        setError("Could not find that market on Polymarket.");
        setLoading(false);
        return;
      }

      setMarket(info);
      await refreshData(info.outcomes, timeRangeRef.current);
      if (!cancelled) setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [slug, refreshData]);

  // Re-fetch history when time range changes (after initial load)
  useEffect(() => {
    if (outcomesRef.current.length === 0) return;
    timeRangeRef.current = timeRange;
    refreshData(outcomesRef.current, timeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  // Polling
  useEffect(() => {
    if (outcomes.length === 0) return;

    intervalRef.current = setInterval(() => {
      refreshData(outcomesRef.current, timeRangeRef.current);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes.length > 0, refreshData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = extractSlug(urlInput);
    if (!s) {
      setError("Paste a Polymarket URL like polymarket.com/event/some-slug");
      return;
    }
    // Stop previous polling
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSlug(s);
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSlug(null);
    setMarket(null);
    setOutcomes([]);
    setError(null);
    setUrlInput("");
  }

  // No market loaded — show input
  if (!slug) {
    return (
      <main className="min-h-screen h-screen bg-gradient-to-b from-black to-zinc-950 text-white flex flex-col items-center justify-center px-6">
        <Link
          href="/"
          className="absolute top-4 left-6 text-sm text-white/50 hover:text-white/80 transition"
        >
          &larr; Home
        </Link>
        <h1 className="text-3xl font-bold mb-6">Polymarket Live</h1>
        <form onSubmit={handleSubmit} className="w-full max-w-lg flex gap-3">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a Polymarket event URL..."
            className="flex-1 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-xl bg-white/10 px-6 py-3 font-medium hover:bg-white/20 transition"
          >
            Go
          </button>
        </form>
        {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
      </main>
    );
  }

  // Determine how to display based on outcome count
  const isBinary = market && outcomes.length === 2 && outcomes[0].name === "Yes";

  return (
    <main className="min-h-screen h-screen overflow-hidden bg-gradient-to-b from-black to-zinc-950 px-6 py-4 text-white flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <Link
          href="/"
          className="text-sm text-white/50 hover:text-white/80 transition"
        >
          &larr; Home
        </Link>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setTimeRange(r.label)}
              className={`px-2.5 py-1 text-xs rounded-lg transition ${
                timeRange === r.label
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleReset}
          className="text-sm text-white/50 hover:text-white/80 transition"
        >
          Change market
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/60 text-lg">Loading market...</p>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      )}

      {!loading && !error && market && outcomes.length > 0 && (() => {
        if (isBinary) {
          // Simple Yes/No — show one big percentage
          const yesPrice = outcomes[0].currentPrice;
          const pct = Math.round(yesPrice * 100);
          return (
            <>
              <div className="shrink-0 text-center pt-2">
                <div className="text-xl text-white/60 mb-2">{market.title}</div>
                <div
                  className="text-[10rem] leading-none font-bold tabular-nums"
                  style={{ color: COLORS[0] }}
                >
                  {pct}%
                </div>
                <div className="text-lg text-white/40 mt-1">Yes</div>
              </div>
              <div className="mt-4 flex-1 min-h-0">
                <OddsChart
                  outcomes={[outcomes[0]]}
                  colors={COLORS}
                  startTs={getStartTs(timeRange)}
                />
              </div>
            </>
          );
        }

        // Multi-outcome — normalize and show top outcomes
        const sum = outcomes.reduce((s, o) => s + o.currentPrice, 0) || 1;
        const normalized = outcomes.map((o) => Math.round((o.currentPrice / sum) * 100));
        const diff = 100 - normalized.reduce((s, n) => s + n, 0);
        if (diff !== 0) {
          const maxIdx = normalized.indexOf(Math.max(...normalized));
          normalized[maxIdx] += diff;
        }

        // Show top outcomes in the header (limit to what fits)
        const topCount = Math.min(outcomes.length, 4);
        const topOutcomes = outcomes.slice(0, topCount);
        const topNormalized = normalized.slice(0, topCount);

        return (
          <>
            <div className="text-center text-lg text-white/50 mt-1 shrink-0">
              {market.title}
            </div>
            <div className="flex justify-center items-center gap-12 shrink-0 pt-2">
              {topOutcomes.map((o, i) => (
                <div key={o.tokenId} className="text-center">
                  <div className="text-xl font-semibold text-white/70 mb-1">
                    {o.name}
                  </div>
                  <div
                    className="text-[7rem] leading-none font-bold tabular-nums"
                    style={{ color: COLORS[i % COLORS.length] }}
                  >
                    {topNormalized[i]}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex-1 min-h-0">
              <OddsChart
                outcomes={topOutcomes}
                colors={COLORS}
                startTs={getStartTs(timeRange)}
              />
            </div>
          </>
        );
      })()}
    </main>
  );
}

// -- Chart Component --
function OddsChart({
  outcomes,
  colors,
  startTs,
}: {
  outcomes: Outcome[];
  colors: string[];
  startTs: number;
}) {
  const allPoints = outcomes.flatMap((o) => o.history);

  if (allPoints.length === 0) {
    return (
      <div className="h-full rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
        <p className="text-white/40">Waiting for price history...</p>
      </div>
    );
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const tMin = startTs > 0 ? startTs : Math.min(...allPoints.map((p) => p.t));
  const tMax = nowTs;
  const tRange = Math.max(1, tMax - tMin);

  // Dynamic Y range from data
  const allPrices = allPoints.map((p) => p.p);
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const spread = Math.max(0.01, dataMax - dataMin);
  const yMin = Math.max(0, dataMin - spread * 0.08);
  const yMax = Math.min(1, dataMax + spread * 0.08);

  const xLeft = 5;
  const xRight = 97;
  const xSpan = xRight - xLeft;
  const yTop = 5;
  const yBottom = 92;
  const ySpanSvg = yBottom - yTop;

  function toSvgX(t: number): number {
    return xLeft + ((t - tMin) / tRange) * xSpan;
  }
  function toSvgY(p: number): number {
    return yBottom - ((p - yMin) / (yMax - yMin)) * ySpanSvg;
  }

  // Time labels — adaptive interval based on duration
  const duration = tMax - tMin;
  let interval: number;
  if (duration < 3600) interval = 10 * 60;
  else if (duration < 7200) interval = 15 * 60;
  else if (duration < 14400) interval = 30 * 60;
  else if (duration < 86400) interval = 60 * 60;
  else if (duration < 604800) interval = 6 * 3600;
  else interval = 24 * 3600;

  const timeLabels: { ts: number; label: string }[] = [];
  const labelStart = startTs > 0 ? startTs : tMin;
  for (let ts = labelStart; ts <= nowTs; ts += interval) {
    const d = new Date(ts * 1000);
    const label =
      duration > 86400
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    timeLabels.push({ ts, label });
  }

  // Dynamic Y labels — nice round percentages within range
  const yLabels: number[] = [];
  const yMinPct = Math.ceil(yMin * 100 / 5) * 5;
  const yMaxPct = Math.floor(yMax * 100 / 5) * 5;
  const step = yMaxPct - yMinPct <= 20 ? 5 : 10;
  for (let pct = yMinPct; pct <= yMaxPct; pct += step) {
    yLabels.push(pct);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Legend */}
      {outcomes.length > 1 && (
        <div className="flex items-center justify-center gap-6 mb-2 shrink-0">
          {outcomes.map((o, i) => (
            <div key={o.tokenId} className="flex items-center gap-2">
              <div
                className="w-4 h-1 rounded"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-sm text-white/70">{o.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/30 relative overflow-hidden">
        {yLabels.map((pct) => {
          const topPct = (toSvgY(pct / 100) / 100) * 100;
          return (
            <div
              key={pct}
              className="absolute left-1 text-[11px] text-white/50 -translate-y-1/2 z-10"
              style={{ top: `${topPct}%` }}
            >
              {pct}%
            </div>
          );
        })}

        {timeLabels.map((tl) => {
          const leftPct = (toSvgX(tl.ts) / 100) * 100;
          return (
            <div
              key={tl.ts}
              className="absolute bottom-1 text-[10px] text-white/45 -translate-x-1/2 z-10"
              style={{ left: `${leftPct}%` }}
            >
              {tl.label}
            </div>
          );
        })}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {yLabels.map((pct) => (
            <line
              key={pct}
              x1={xLeft}
              y1={toSvgY(pct / 100)}
              x2={xRight}
              y2={toSvgY(pct / 100)}
              stroke="rgba(255,255,255,0.07)"
            />
          ))}
          <line
            x1={xLeft}
            y1={yBottom}
            x2={xRight}
            y2={yBottom}
            stroke="rgba(255,255,255,0.10)"
          />

          {outcomes.map((o, i) => {
            if (o.history.length < 2) return null;
            const points = o.history
              .map((pt) => `${toSvgX(pt.t)},${toSvgY(pt.p)}`)
              .join(" ");
            const lastPt = o.history[o.history.length - 1];
            const color = colors[i % colors.length];
            return (
              <g key={o.tokenId}>
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth="0.5"
                  points={points}
                />
                <circle
                  cx={toSvgX(lastPt.t)}
                  cy={toSvgY(lastPt.p)}
                  r="0.8"
                  fill={color}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
