"use client";

import type { MarketInfo, Outcome } from "../_lib/types";
import { COLORS } from "../_lib/constants";

export default function OddsDisplay({
  market,
  outcomes,
  compact,
  mobileLandscape = false,
}: {
  market: MarketInfo;
  outcomes: Outcome[];
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

  // Multi-outcome — normalize and show top outcomes
  const sum = outcomes.reduce((s, o) => s + o.currentPrice, 0) || 1;
  const normalized = outcomes.map((o) =>
    Math.round((o.currentPrice / sum) * 100)
  );
  const diff = 100 - normalized.reduce((s, n) => s + n, 0);
  if (diff !== 0) {
    const maxIdx = normalized.indexOf(Math.max(...normalized));
    normalized[maxIdx] += diff;
  }

  const topCount = compact ? Math.min(outcomes.length, 2) : Math.min(outcomes.length, 4);
  const topOutcomes = outcomes.slice(0, topCount);
  const topNormalized = normalized.slice(0, topCount);

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
      <div
        className={
          compact
            ? "grid grid-cols-2 gap-x-2 gap-y-0.5 px-1 pt-1"
            : "grid grid-cols-2 gap-x-4 gap-y-2 md:flex md:justify-center md:items-center md:gap-12 pt-2 px-2 md:px-0"
        }
      >
        {topOutcomes.map((o, i) => (
          <div key={o.tokenId} className="text-center">
            <div
              className={
                mobileLandscape
                  ? "text-[8px] font-semibold text-white/70 truncate"
                  : compact
                  ? "text-[10px] font-semibold text-white/70 truncate"
                  : "text-sm md:text-xl font-semibold text-white/70 mb-0.5 md:mb-1 truncate"
              }
            >
              {o.name}
            </div>
            <div
              className={
                mobileLandscape
                  ? "text-base leading-none font-bold tabular-nums"
                  : compact
                  ? "text-xl md:text-3xl leading-none font-bold tabular-nums"
                  : "text-4xl md:text-[7rem] leading-none font-bold tabular-nums"
              }
              style={{ color: COLORS[i % COLORS.length] }}
            >
              {topNormalized[i]}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
