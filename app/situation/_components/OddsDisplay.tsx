"use client";

import type { MarketInfo, Outcome } from "../_lib/types";
import { COLORS } from "../_lib/constants";
import { formatHistoricalPercentage } from "../_lib/chartHover";
import {
  formatPolymarketPercentage,
  getPolymarketPercentages,
  getVisiblePolymarketOutcomes,
} from "../_lib/outcomes";

export default function OddsDisplay({
  market,
  outcomes,
  visibleOutcomes,
  colors = COLORS,
  compact,
  mobileLandscape = false,
  tvMode = false,
  hoveredPrices = null,
}: {
  market: MarketInfo;
  outcomes: Outcome[];
  visibleOutcomes?: Outcome[];
  colors?: string[];
  compact: boolean;
  mobileLandscape?: boolean;
  tvMode?: boolean;
  hoveredPrices?: Record<string, number | null> | null;
}) {
  const isBinary = market.kind === "binary";
  const { percentages } = getPolymarketPercentages(market, outcomes);
  const percentage = (tokenId: string) => hoveredPrices !== null
    ? formatHistoricalPercentage(hoveredPrices[tokenId])
    : formatPolymarketPercentage(percentages.get(tokenId));

  if (isBinary) {
    return (
      <div
        className={`shrink-0 text-center pt-1 ${tvMode ? "flex items-baseline justify-center gap-2" : ""}`}
        data-readout-mode={hoveredPrices ? "historical" : "live"}
      >
        {!mobileLandscape && !tvMode && (
          <div
            data-readout-title
            className={
              compact
                ? "text-xs text-white/60 mb-0.5 truncate px-2"
                : "text-base md:text-xl text-white/60 mb-2 truncate px-2"
            }
          >
            {market.title}
          </div>
        )}
        <div
          className={
            tvMode
              ? "tv-odds-value leading-none font-bold tabular-nums"
              : mobileLandscape
              ? "text-2xl leading-none font-bold tabular-nums"
              : compact
              ? "text-3xl md:text-5xl leading-none font-bold tabular-nums"
              : "text-6xl md:text-[10rem] leading-none font-bold tabular-nums"
          }
          style={{ color: colors[0] }}
          data-outcome-value={outcomes[0].tokenId}
        >
          {percentage(outcomes[0].tokenId)}
        </div>
        <div
          className={
            tvMode
              ? "tv-value-caption text-white/50"
              : mobileLandscape
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

  const selectedOutcomes = visibleOutcomes ?? getVisiblePolymarketOutcomes(outcomes, compact);

  return (
    <div className="shrink-0" data-readout-mode={hoveredPrices ? "historical" : "live"}>
      {!mobileLandscape && !tvMode && (
        <div
          data-readout-title
          className={
            compact
              ? "text-center text-xs text-white/50 mb-0.5 truncate px-2"
              : "text-center text-sm md:text-lg text-white/50 mt-1 truncate px-2"
          }
        >
          {market.title}
        </div>
      )}
      {compact ? (
        <div className={`flex flex-wrap justify-center gap-x-2 gap-y-1 px-1 pt-1 ${tvMode ? "tv-outcomes" : ""}`}>
          {selectedOutcomes.map((o, i) => (
            <div
              key={o.tokenId}
              className="min-w-0 max-w-full rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-1"
            >
              <div className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="max-w-[90px] truncate text-[9px] font-semibold uppercase tracking-[0.03em] text-white/65">
                  {o.name}
                </span>
                <span
                  className="text-[11px] leading-none font-bold tabular-nums shrink-0"
                  style={{ color: colors[i % colors.length] }}
                  data-outcome-value={o.tokenId}
                >
                  {percentage(o.tokenId)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div data-outcome-list className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 px-2 md:flex md:justify-center md:items-center md:gap-12 md:px-0">
          {selectedOutcomes.map((o, i) => (
            <div key={o.tokenId} className="text-center">
              <div
                data-outcome-name
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
                style={{ color: colors[i % colors.length] }}
                data-outcome-value={o.tokenId}
              >
                {percentage(o.tokenId)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
