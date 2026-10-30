import type { MarketInfo, PolymarketQuote, PricePoint, StockSnapshot } from "./types";
import { PROXY } from "./constants";
import { buildPolymarketInfo, parseProbability } from "./polymarket";

// -- Helpers --

export function extractSlug(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/polymarket\.com\/event\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[\w-]+$/.test(trimmed)) return trimmed;
  return null;
}

// -- API Functions --

export async function fetchEvent(slug: string): Promise<MarketInfo | null> {
  try {
    const res = await fetch(
      `${PROXY}?endpoint=event&slug=${encodeURIComponent(slug)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const event = data[0];
    return event ? buildPolymarketInfo(event, slug) : null;
  } catch {
    return null;
  }
}

export async function fetchPrice(tokenId: string): Promise<PolymarketQuote | null> {
  try {
    const res = await fetch(`${PROXY}?endpoint=price&token_id=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const price = parseProbability(data.price);
    return price == null ? null : { price, normalizationSafe: data.normalizationSafe === true };
  } catch {
    return null;
  }
}

export async function fetchStockData(
  ticker: string,
  yahooRange: string,
  yahooInterval: string,
  /** Optional: filter history to only points at or after this Unix timestamp */
  startTs?: number,
  /** Include extended / pre-post market data (futures, yields, crypto trade wider hours) */
  includePrePost?: boolean,
  /** Keep a quote available while waiting for the first point in a fixed window. */
  allowEmptyHistory: boolean = false,
): Promise<StockSnapshot | null> {
  try {
    const prepost = includePrePost ? "&prepost=true" : "";
    const res = await fetch(
      `${PROXY}?endpoint=stock&ticker=${encodeURIComponent(ticker)}&range=${yahooRange}&interval=${yahooInterval}${prepost}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const meta = result.meta ?? {};

    // Build history, skipping nulls
    let history: PricePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const p = closes[i];
      if (p == null || isNaN(p)) continue;
      history.push({ t: timestamps[i], p });
    }

    const lastAvailablePrice = history[history.length - 1]?.p;
    // Intraday and fixed-start windows share the same timestamp filter.
    if (startTs && startTs > 0) {
      history = history.filter((pt) => pt.t >= startTs);
    }

    if (history.length === 0 && !allowEmptyHistory) return null;

    const currentPrice = history[history.length - 1]?.p ?? meta.regularMarketPrice ?? lastAvailablePrice;
    if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) return null;
    const previousClose: number | null =
      meta.chartPreviousClose ?? meta.previousClose ?? null;

    return { label: ticker, ticker, currentPrice, previousClose, history };
  } catch {
    return null;
  }
}

export async function fetchPriceHistory(
  tokenId: string,
  startTs: number,
  endTs: number,
  fidelity: number = 1
): Promise<PricePoint[]> {
  try {
    const day = 24 * 3600;
    const duration = endTs - startTs;
    // Explicit date windows are capped at 15 days. Presets allow longer
    // windows, but max needs 12-hour spacing to reach beyond 30 days.
    const interval =
      startTs <= 0 || duration > 30 * day
        ? "max"
        : duration > 15 * day
          ? "1m"
          : null;
    const historyFidelity = interval === "max" ? Math.max(fidelity, 720) : fidelity;
    const params =
      interval
        ? `&interval=${interval}&fidelity=${historyFidelity}`
        : `&startTs=${startTs}&endTs=${endTs}&fidelity=${historyFidelity}`;
    const res = await fetch(
      `${PROXY}?endpoint=history&market=${encodeURIComponent(tokenId)}${params}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const history = (data.history ?? []) as PricePoint[];
    // Presets return a wider window; keep only the selected chart range.
    return history.filter((pt) => (startTs <= 0 || pt.t >= startTs) && pt.t <= endTs);
  } catch {
    return [];
  }
}
