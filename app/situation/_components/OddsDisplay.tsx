"use client";

import type { MarketInfo, Outcome } from "../_lib/types";
import { COLORS } from "../_lib/constants";
import { getVisiblePolymarketOutcomes } from "../_lib/outcomes";

export default function OddsDisplay({
  market,
  outcomes,
  visibleOutcomes,
  compact,
  mobileLandscape = false,
}: {
  market: MarketInfo;
  outcomes: Outcome[];
  visibleOutcomes?: Outcome[];
  compact: boolean;
  mobileLandscape?: boolean;
}) {
  const isBinary =
    outcomes.length === 2 && outcomes[0].name === "Yes";

  if (isBinary) {
    const yesPrice = outcomes[0].currentPrice;
    const pct = Math.round(yesPrice * 100);
    return (
      <div className="shrink-0 text-center pt-1">
        {!mobileLandscape && (
          <div
            className={
              compact
                ? "text-xs text-white/60 mb-0.5 truncate px-2"
                : "text-base md:text-xl text-white/60 mb-2"
            }
          >
            {market.title}
          </div>
        )}
        <div
          className={
            mobileLandscape
              ? "text-2xl leading-none font-bold tabular-nums"
              : compact
              ? "text-3xl md:text-5xl leading-none font-bold tabular-nums"
              : "text-6xl md:text-[10rem] leading-none font-bold tabular-nums"
          }
          style={{ color: COLORS[0] }}
        >
          {pct}%
        </div>
        <div
          className={
            mobileLandscape
              ? "text-[9px] text-white/40 mt-0.5"
              : compact
              ? "text-[10px] text-white/40 mt-0.5"
              : "text-sm md:text-lg text-white/40 mt-1"
          }
        >
          Yes
        </div>
      </div>
    );
  }

  // Multi-outcome — normalize and show either the compact threshold set
  // or the top few outcomes in larger layouts.
  const sum = outcomes.reduce((s, o) => s + o.currentPrice, 0) || 1;
  const selectedOutcomes = visibleOutcomes ?? getVisiblePolymarketOutcomes(outcomes, compact);
  const normalizedByToken = new Map(
    outcomes.map((o) => [o.tokenId, Math.round((o.currentPrice / sum) * 100)])
  );
  const diff = 100 - Array.from(normalizedByToken.values()).reduce((s, n) => s + n, 0);
  if (diff !== 0 && outcomes.length > 0) {
    const maxOutcome = outcomes.reduce((best, outcome) =>
      (normalizedByToken.get(outcome.tokenId) ?? 0) > (normalizedByToken.get(best.tokenId) ?? 0)
        ? outcome
        : best
    );
    normalizedByToken.set(
      maxOutcome.tokenId,
      (normalizedByToken.get(maxOutcome.tokenId) ?? 0) + diff
    );
  }

  return (
    <div className="shrink-0">
      {!mobileLandscape && (
        <div
          className={
            compact
              ? "text-center text-xs text-white/50 mb-0.5 truncate px-2"
              : "text-center text-sm md:text-lg text-white/50 mt-1"
          }
        >
          {market.title}
        </div>
      )}
      {compact ? (
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 px-1 pt-1">
          {selectedOutcomes.map((o, i) => (
            <div
              key={o.tokenId}
              className="min-w-0 max-w-full rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-1"
            >
              <div className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="max-w-[90px] truncate text-[9px] font-semibold uppercase tracking-[0.03em] text-white/65">
                  {o.name}
                </span>
                <span
                  className="text-[11px] leading-none font-bold tabular-nums"
                  style={{ color: COLORS[i % COLORS.length] }}
                >
                  {normalizedByToken.get(o.tokenId) ?? 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 px-2 md:flex md:justify-center md:items-center md:gap-12 md:px-0">
          {selectedOutcomes.map((o, i) => (
            <div key={o.tokenId} className="text-center">
              <div
                className={
                  mobileLandscape
                    ? "text-[8px] font-semibold text-white/70 truncate"
                    : "text-sm md:text-xl font-semibold text-white/70 mb-0.5 md:mb-1 truncate"
                }
              >
                {o.name}
              </div>
              <div
                className={
                  mobileLandscape
                    ? "text-base leading-none font-bold tabular-nums"
                    : "text-4xl md:text-[7rem] leading-none font-bold tabular-nums"
                }
                style={{ color: COLORS[i % COLORS.length] }}
              >
                {normalizedByToken.get(o.tokenId) ?? 0}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
