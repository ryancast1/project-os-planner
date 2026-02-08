"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";

// -- Types --
type PricePoint = { t: number; p: number };

type TeamData = {
  name: string;
  tokenId: string;
  currentPrice: number;
  history: PricePoint[];
};

// -- Constants --
const PROXY = "/superbowl/api";
const EVENT_SLUG = "super-bowl-champion-2026-731";
const TEAM_KEYWORDS = ["seahawks", "patriots"];
const REFRESH_INTERVAL_MS = 12_000;

const TEAM_COLORS = [
  "rgba(0, 200, 83, 0.95)",
  "rgba(59, 130, 246, 0.95)",
];

// Game start: 6:30 PM ET on Feb 8, 2026
function getGameStartUnix(): number {
  const d = new Date("2026-02-08T18:30:00-05:00");
  return Math.floor(d.getTime() / 1000);
}

// -- API Functions --
async function fetchMarketTokens(): Promise<{
  teams: { name: string; tokenId: string }[];
} | null> {
  try {
    const res = await fetch(`${PROXY}?endpoint=event&slug=${EVENT_SLUG}`);
    if (!res.ok) return null;
    const data = await res.json();
    const event = data[0];
    if (!event?.markets?.length) return null;

    // Each market is a per-team binary (Yes/No) market.
    // Find the Seahawks and Patriots markets by keyword in the question.
    const teams: { name: string; tokenId: string }[] = [];
    for (const keyword of TEAM_KEYWORDS) {
      const market = event.markets.find((m: { question?: string }) =>
        (m.question ?? "").toLowerCase().includes(keyword)
      );
      if (!market) continue;

      // The YES token is the first clobTokenId
      const tokenIds: string[] = (
        typeof market.clobTokenIds === "string"
          ? JSON.parse(market.clobTokenIds)
          : market.clobTokenIds
      ) as string[];
      const yesToken = tokenIds[0];

      // Extract a clean team name from the question
      // e.g. "Will the Seattle Seahawks win Super Bowl 2026?" -> "Seattle Seahawks"
      const match = (market.question as string).match(
        /Will the (.+?) win Super Bowl/
      );
      const name = match ? match[1] : keyword.charAt(0).toUpperCase() + keyword.slice(1);

      teams.push({ name, tokenId: yesToken });
    }

    return teams.length >= 2 ? { teams } : null;
  } catch {
    return null;
  }
}

async function fetchPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${PROXY}?endpoint=price&token_id=${tokenId}`
    );
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
  endTs: number
): Promise<PricePoint[]> {
  try {
    const res = await fetch(
      `${PROXY}?endpoint=history&market=${tokenId}&startTs=${startTs}&endTs=${endTs}&fidelity=1`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.history ?? []) as PricePoint[];
  } catch {
    return [];
  }
}

// -- Main Component --
export default function SuperBowlPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const teamsRef = useRef<TeamData[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameStartTs = useMemo(() => getGameStartUnix(), []);

  const refreshData = useCallback(
    async (currentTeams: TeamData[]) => {
      const now = Math.floor(Date.now() / 1000);
      const updated = await Promise.all(
        currentTeams.map(async (team) => {
          const [price, history] = await Promise.all([
            fetchPrice(team.tokenId),
            fetchPriceHistory(team.tokenId, gameStartTs, now),
          ]);
          return {
            ...team,
            currentPrice: price ?? team.currentPrice,
            history: history.length > 0 ? history : team.history,
          };
        })
      );
      teamsRef.current = updated;
      setTeams(updated);
      setLastUpdated(new Date());
    },
    [gameStartTs]
  );

  // Initial load: discover tokens, then fetch prices + history
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const result = await fetchMarketTokens();
      if (cancelled) return;
      if (!result) {
        setError("Could not load market data from Polymarket.");
        setLoading(false);
        return;
      }

      const initial: TeamData[] = result.teams.map((t) => ({
        name: t.name,
        tokenId: t.tokenId,
        currentPrice: 0,
        history: [],
      }));

      await refreshData(initial);
      if (!cancelled) setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [refreshData]);

  // Polling interval for live updates
  useEffect(() => {
    if (teams.length === 0) return;

    intervalRef.current = setInterval(() => {
      refreshData(teamsRef.current);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // Only set up once when teams first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams.length > 0, refreshData]);

  return (
    <main className="min-h-screen h-screen overflow-hidden bg-gradient-to-b from-black to-zinc-950 px-6 py-4 text-white flex flex-col">
      <Link
        href="/"
        className="absolute top-4 left-6 text-sm text-white/50 hover:text-white/80 transition z-10"
      >
        &larr; Home
      </Link>

      {/* Loading / Error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/60 text-lg">Loading odds...</p>
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && teams.length >= 2 && (() => {
        const sum = teams.reduce((s, t) => s + t.currentPrice, 0) || 1;
        const normalized = teams.map((t) => Math.round((t.currentPrice / sum) * 100));
        const diff = 100 - normalized.reduce((s, n) => s + n, 0);
        if (diff !== 0) {
          const maxIdx = normalized.indexOf(Math.max(...normalized));
          normalized[maxIdx] += diff;
        }
        return (
        <>
          {/* Odds */}
          <div className="flex justify-center items-center gap-16 shrink-0 pt-2">
            {teams.map((team, i) => (
              <div key={team.tokenId} className="text-center">
                <div className="text-2xl font-semibold text-white/70 mb-1">
                  {team.name}
                </div>
                <div
                  className="text-[8rem] leading-none font-bold tabular-nums"
                  style={{ color: TEAM_COLORS[i] }}
                >
                  {normalized[i]}%
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="mt-4 flex-1 min-h-0">
            <OddsChart
              teams={teams}
              colors={TEAM_COLORS}
              gameStartTs={gameStartTs}
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
  teams,
  colors,
  gameStartTs,
}: {
  teams: TeamData[];
  colors: string[];
  gameStartTs: number;
}) {
  const allPoints = teams.flatMap((t) => t.history);

  if (allPoints.length === 0) {
    return (
      <div className="h-full rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
        <p className="text-white/40">Waiting for price history...</p>
      </div>
    );
  }

  const nowTs = Math.floor(Date.now() / 1000);
  const tMin = gameStartTs;
  const tMax = nowTs;
  const tRange = Math.max(1, tMax - tMin);

  const yMin = 0;
  const yMax = 1;

  // SVG coordinate mapping
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

  // Time labels every 30 minutes from game start
  const timeLabels: { ts: number; label: string }[] = [];
  const THIRTY_MIN = 30 * 60;
  for (let ts = gameStartTs; ts <= nowTs; ts += THIRTY_MIN) {
    const d = new Date(ts * 1000);
    timeLabels.push({
      ts,
      label: d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }),
    });
  }

  const yLabels = [0, 25, 50, 75, 100];

  return (
    <div className="h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mb-2 shrink-0">
        {teams.map((team, i) => (
          <div key={team.tokenId} className="flex items-center gap-2">
            <div
              className="w-4 h-1 rounded"
              style={{ backgroundColor: colors[i] }}
            />
            <span className="text-sm text-white/70">{team.name}</span>
          </div>
        ))}
      </div>

      {/* Chart container */}
      <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/30 relative overflow-hidden">
        {/* Y axis labels */}
        {yLabels.map((pct) => {
          const svgY = toSvgY(pct / 100);
          const topPct = (svgY / 100) * 100;
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

        {/* X axis labels */}
        {timeLabels.map((tl) => {
          const svgX = toSvgX(tl.ts);
          const leftPct = (svgX / 100) * 100;
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

        {/* SVG chart */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Horizontal grid lines */}
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

          {/* Baseline */}
          <line
            x1={xLeft}
            y1={yBottom}
            x2={xRight}
            y2={yBottom}
            stroke="rgba(255,255,255,0.10)"
          />

          {/* Price lines for each team */}
          {teams.map((team, i) => {
            if (team.history.length < 2) return null;
            const points = team.history
              .map((pt) => `${toSvgX(pt.t)},${toSvgY(pt.p)}`)
              .join(" ");
            const lastPt = team.history[team.history.length - 1];
            return (
              <g key={team.tokenId}>
                <polyline
                  fill="none"
                  stroke={colors[i]}
                  strokeWidth="0.5"
                  points={points}
                />
                <circle
                  cx={toSvgX(lastPt.t)}
                  cy={toSvgY(lastPt.p)}
                  r="0.8"
                  fill={colors[i]}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
