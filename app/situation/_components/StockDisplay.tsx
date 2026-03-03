"use client";

import type { StockSnapshot } from "../_lib/types";
import { COLOR_GREEN, COLOR_RED } from "../_lib/constants";

function formatPrice(p: number): string {
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}K`;
  if (p >= 1000)
    return `$${p.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  if (p >= 100) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(2)}`;
}

/** Format a treasury yield — e.g. 4.25 → "4.25%" */
function formatYield(p: number): string {
  return `${p.toFixed(2)}%`;
}

/** Format an absolute yield change — e.g. 0.05 → "+0.050%" */
function formatYieldDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}%`;
}

export default function StockDisplay({
  snapshot,
  compact,
  mobileLandscape = false,
}: {
  snapshot: StockSnapshot;
  compact: boolean;
  mobileLandscape?: boolean;
}) {
  const { label, currentPrice, previousClose, displayType } = snapshot;
  const isYield = displayType === "yield";

  const change =
    previousClose != null ? currentPrice - previousClose : null;
  const changePct =
    previousClose != null && previousClose !== 0
      ? (change! / previousClose) * 100
      : null;
  const isUp = changePct != null ? changePct >= 0 : null;
  const accentColor =
    isUp === null ? COLOR_GREEN : isUp ? COLOR_GREEN : COLOR_RED;

  return (
    <div className="shrink-0 text-center pt-1">
      {/* Label hidden in landscape mobile — shown in panel title bar instead */}
      {!mobileLandscape && (
        <div
          className={
            compact
              ? "text-xs text-white/60 mb-0.5 truncate px-2"
              : "text-base md:text-xl text-white/60 mb-1"
          }
        >
          {label}
        </div>
      )}

      <div
        className={
          mobileLandscape
            ? "text-2xl leading-none font-bold tabular-nums"
            : compact
            ? "text-3xl md:text-5xl leading-none font-bold tabular-nums"
            : "text-5xl md:text-[7rem] leading-none font-bold tabular-nums"
        }
        style={{ color: accentColor }}
      >
        {isYield ? formatYield(currentPrice) : formatPrice(currentPrice)}
      </div>

      {changePct != null && (
        <div
          className={
            mobileLandscape
              ? "text-[9px] mt-0.5 tabular-nums"
              : compact
              ? "text-[10px] mt-0.5 tabular-nums"
              : "text-sm md:text-base mt-1 tabular-nums"
          }
          style={{ color: accentColor }}
        >
          {isYield
            ? formatYieldDelta(change!)
            : `${isUp ? "+" : ""}${formatPrice(Math.abs(change!))} (${isUp ? "+" : ""}${changePct.toFixed(2)}%)`}
        </div>
      )}
    </div>
  );
}
