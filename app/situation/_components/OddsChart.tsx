"use client";

import type { Outcome } from "../_lib/types";

type ValueFormat = "percent" | "price" | "yield";

/** Compute nice round price intervals for the Y axis */
function getNicePriceLabels(min: number, max: number): number[] {
  const range = max - min;
  if (range <= 0) return [min];
  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  const fraction = range / magnitude;
  let step: number;
  if (fraction <= 1) step = 0.1 * magnitude;
  else if (fraction <= 2) step = 0.2 * magnitude;
  else if (fraction <= 5) step = 0.5 * magnitude;
  else step = magnitude;

  const first = Math.ceil(min / step) * step;
  const labels: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) {
    labels.push(parseFloat(v.toPrecision(10)));
    if (labels.length > 10) break;
  }
  return labels;
}

function formatPriceLabel(v: number): string {
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}K`;
  if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 10) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

export default function OddsChart({
  outcomes,
  colors,
  startTs,
  valueFormat = "percent",
  xMin,
  xMax,
  mobileLandscape = false,
}: {
  outcomes: Outcome[];
  colors: string[];
  startTs: number;
  valueFormat?: ValueFormat;
  /** Override the left edge of the X-axis (Unix seconds) */
  xMin?: number;
  /** Override the right edge of the X-axis (Unix seconds) */
  xMax?: number;
  /** Landscape mobile: hide legend, X-axis, and reduce Y to top+bottom only */
  mobileLandscape?: boolean;
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
  const tMin = xMin ?? (startTs > 0 ? startTs : Math.min(...allPoints.map((p) => p.t)));
  const tMax = xMax ?? nowTs;
  const tRange = Math.max(1, tMax - tMin);

  // Dynamic Y range — clamp to 0-1 for probabilities, free for prices/yields
  const allPrices = allPoints.map((p) => p.p);
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const spread = Math.max(valueFormat === "price" ? 1 : 0.01, dataMax - dataMin);
  const isFreefloat = valueFormat === "price" || valueFormat === "yield";
  const yMin = isFreefloat
    ? dataMin - spread * 0.08
    : Math.max(0, dataMin - spread * 0.08);
  const yMax = isFreefloat
    ? dataMax + spread * 0.08
    : Math.min(1, dataMax + spread * 0.08);

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

  // Time labels — pick the smallest "nice" interval that keeps label count ≤ 7
  const duration = tMax - tMin;
  const NICE_INTERVALS = [
    10 * 60, 15 * 60, 30 * 60,
    3600, 6 * 3600, 12 * 3600,
    24 * 3600,
    7 * 24 * 3600,
    14 * 24 * 3600,
    30 * 24 * 3600,
    91 * 24 * 3600,
    182 * 24 * 3600,
    365 * 24 * 3600,
  ];
  const minInterval = duration / 7;
  const interval = NICE_INTERVALS.find((v) => v >= minInterval) ?? 365 * 24 * 3600;

  const timeLabels: { ts: number; label: string }[] = [];
  // When xMin is set (e.g. market hours), round up to the next clean hour boundary
  const labelStart =
    xMin != null
      ? Math.ceil(xMin / 3600) * 3600
      : startTs > 0
      ? startTs
      : tMin;
  const labelEnd = xMax ?? nowTs;
  for (let ts = labelStart; ts <= labelEnd; ts += interval) {
    const d = new Date(ts * 1000);
    let label: string;
    if (interval < 86400) {
      label = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } else if (interval < 91 * 86400) {
      label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      // Quarterly or longer: show "Jan '24" to include year context
      label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    timeLabels.push({ ts, label });
  }

  // Y labels — different for price vs yield vs percent
  type YLabel = { value: number; display: string };
  let yLabels: YLabel[];

  if (valueFormat === "price") {
    yLabels = getNicePriceLabels(yMin, yMax).map((v) => ({
      value: v,
      display: formatPriceLabel(v),
    }));
  } else if (valueFormat === "yield") {
    // Yield values are already in percent form (e.g. 4.25 = 4.25%)
    yLabels = getNicePriceLabels(yMin, yMax).map((v) => ({
      value: v,
      display: `${v.toFixed(2)}%`,
    }));
  } else {
    const yMinPct = Math.ceil((yMin * 100) / 5) * 5;
    const yMaxPct = Math.floor((yMax * 100) / 5) * 5;
    const step = yMaxPct - yMinPct <= 20 ? 5 : 10;
    yLabels = [];
    for (let pct = yMinPct; pct <= yMaxPct; pct += step) {
      yLabels.push({ value: pct / 100, display: `${pct}%` });
    }
  }

  // In landscape mobile: only show the top and bottom Y labels
  const displayYLabels =
    mobileLandscape && yLabels.length > 2
      ? [yLabels[0], yLabels[yLabels.length - 1]]
      : yLabels;

  return (
    <div className="h-full flex flex-col">
      {/* Legend — hidden in landscape mobile (colors match inline %) */}
      {outcomes.length > 1 && !mobileLandscape && (
        <div className="flex items-center justify-center gap-4 mb-1 shrink-0">
          {outcomes.map((o, i) => (
            <div key={o.tokenId} className="flex items-center gap-1.5">
              <div
                className="w-3 h-1 rounded"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-xs text-white/70">{o.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/30 relative overflow-hidden">
        {/* Y axis labels */}
        {displayYLabels.map((yl) => {
          const topPct = (toSvgY(yl.value) / 100) * 100;
          return (
            <div
              key={yl.value}
              className="absolute left-1 text-[11px] text-white/50 -translate-y-1/2 z-10"
              style={{ top: `${topPct}%` }}
            >
              {yl.display}
            </div>
          );
        })}

        {/* X axis time labels — hidden in landscape mobile */}
        {!mobileLandscape && timeLabels.map((tl) => {
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
          {/* Y gridlines */}
          {yLabels.map((yl) => (
            <line
              key={yl.value}
              x1={xLeft}
              y1={toSvgY(yl.value)}
              x2={xRight}
              y2={toSvgY(yl.value)}
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

          {/* Lines */}
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
