import type { MarketInfo, PolymarketQuote, PricePoint, StockSnapshot } from "./types";
import { PROXY } from "./constants";
import { buildPolymarketInfo, parseProbability } from "./polymarket";
import { createRequestCache } from "./requestCache";
import { createQuoteBatcher } from "./quoteBatcher";
import { createChartHistoryCache } from "./chartHistory";

const events = createRequestCache<MarketInfo | null>();
const stocks = createRequestCache<StockSnapshot | null>();
const histories = createRequestCache<PricePoint[] | null>();

export const fetchBatchedPrice = createQuoteBatcher(async (tokenIds) => {
  const response = await fetch(`${PROXY}?endpoint=prices`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenIds }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return {};
  const data = await response.json();
  return Object.fromEntries(tokenIds.map((token) => {
    const quote = data.quotes?.[token];
    const price = parseProbability(quote?.price);
    return [token, price == null ? null : { price, normalizationSafe: quote.normalizationSafe === true }];
  }));
});

export const chartHistory = createChartHistoryCache(requestPriceHistory);

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
  return events.get(slug, 5 * 60_000, () => requestEvent(slug), (value) => value !== null);
}

async function requestEvent(slug: string): Promise<MarketInfo | null> {
  try {
    const res = await fetch(
      `${PROXY}?endpoint=event&slug=${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(20_000) },
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
  const key = JSON.stringify([ticker, yahooRange, yahooInterval, startTs, includePrePost, allowEmptyHistory]);
  return stocks.get(key, 4000, () => requestStockData(ticker, yahooRange, yahooInterval, startTs, includePrePost, allowEmptyHistory), (value) => value !== null);
}

async function requestStockData(
  ticker: string,
  yahooRange: string,
  yahooInterval: string,
  startTs?: number,
  includePrePost?: boolean,
  allowEmptyHistory = false,
): Promise<StockSnapshot | null> {
  try {
    const prepost = includePrePost ? "&prepost=true" : "";
    const res = await fetch(
      `${PROXY}?endpoint=stock&ticker=${encodeURIComponent(ticker)}&range=${yahooRange}&interval=${yahooInterval}${prepost}`,
      { signal: AbortSignal.timeout(20_000) },
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
  return (await requestPriceHistory(tokenId, startTs, endTs, fidelity)) ?? [];
}

async function requestPriceHistory(
  tokenId: string, startTs: number, endTs: number, fidelity: number,
): Promise<PricePoint[] | null> {
  // Fetch a covering minute-aligned window so charts and Movers can share it.
  // Always trim for each caller so a cached response cannot leak future points.
  const start = Math.floor(startTs / 60) * 60;
  const end = Math.ceil(endTs / 60) * 60;
  const key = `${tokenId}:${start}:${end}:${fidelity}`;
  const history = await histories.get(key, 30_000, () => requestHistory(tokenId, start, end, fidelity), (value) => value !== null);
  return history?.filter((point) => (startTs <= 0 || point.t >= startTs) && point.t <= endTs) ?? null;
}

async function requestHistory(tokenId: string, startTs: number, endTs: number, fidelity: number): Promise<PricePoint[] | null> {
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
      `${PROXY}?endpoint=history&market=${encodeURIComponent(tokenId)}${params}`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw: unknown[] = Array.isArray(data?.history) ? data.history : [];
    const history = raw.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Partial<PricePoint>;
      const price = parseProbability(point.p);
      return typeof point.t === "number" && Number.isFinite(point.t) && price !== null
        ? [{ t: point.t, p: price }] : [];
    });
    // Presets return a wider window; keep only the selected chart range.
    return history.filter((pt) => (startTs <= 0 || pt.t >= startTs) && pt.t <= endTs);
  } catch {
    return null;
  }
}
