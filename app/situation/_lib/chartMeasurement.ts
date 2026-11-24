import { findNearestPricePoint } from "./chartHover";
import type { Outcome, PricePoint } from "./types";

export const CHART_MEASURE_EVENT = "market-chart-measure-start";
export type ChartValueFormat = "percent" | "price" | "yield";
export type ChartRange = { start: number; end: number };
export type RangeMeasurement = {
  tokenId: string;
  name: string;
  start: PricePoint | null;
  end: PricePoint | null;
  change: number | null;
  absoluteChange: number | null;
  unit: "%" | "pp" | "bp";
};

export function snapChartTimestamp(outcomes: Outcome[], timestamp: number): number | null {
  let nearest: PricePoint | null = null;
  for (const outcome of outcomes) {
    const point = findNearestPricePoint(outcome.history, timestamp);
    if (!point || !Number.isFinite(point.t) || !Number.isFinite(point.p)) continue;
    if (!nearest || Math.abs(point.t - timestamp) < Math.abs(nearest.t - timestamp)
      || (Math.abs(point.t - timestamp) === Math.abs(nearest.t - timestamp) && point.t < nearest.t)) nearest = point;
  }
  return nearest?.t ?? null;
}

export function getRangeMeasurements(outcomes: Outcome[], range: ChartRange, format: ChartValueFormat): RangeMeasurement[] {
  const from = Math.min(range.start, range.end);
  const to = Math.max(range.start, range.end);
  return outcomes.map((outcome) => {
    const endpoint = (timestamp: number) => {
      const point = findNearestPricePoint(outcome.history, timestamp);
      return point && Number.isFinite(point.p) && (format !== "percent" || (point.p >= 0 && point.p <= 1)) ? point : null;
    };
    const start = endpoint(from);
    const end = endpoint(to);
    const absoluteChange = start && end ? end.p - start.p : null;
    const change = absoluteChange === null ? null : format === "price"
      ? start!.p > 0 ? absoluteChange / start!.p * 100 : null
      : absoluteChange * 100;
    return {
      tokenId: outcome.tokenId, name: outcome.name, start, end,
      absoluteChange, change: change == null || !Number.isFinite(change) ? null : Math.round(change * 1e9) / 1e9,
      unit: format === "price" ? "%" : format === "yield" ? "bp" : "pp",
    };
  });
}

export function formatRangeChange(measurement: Pick<RangeMeasurement, "change" | "unit">): string {
  const { change, unit } = measurement;
  if (change == null || !Number.isFinite(change)) return "--";
  const sign = change > 0 ? "+" : change < 0 ? "-" : "";
  const magnitude = Math.abs(change);
  const number = magnitude > 0 && magnitude < 0.01 ? "<0.01" : magnitude.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${number}${unit === "%" ? "%" : ` ${unit}`}`;
}
