import type { MarketInfo, Outcome, PricePoint, StockSnapshot } from "./types";
import { PROXY } from "./constants";

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
    if (!event?.markets?.length) return null;

    const title: string = event.title ?? slug;

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
        (m.question ?? "")
          .replace(/^Will (the )?/i, "")
          .replace(/\?$/, "")
          .replace(/ win .+$/, "");
      return { name, tokenId: tokenIds[0], currentPrice: 0, history: [] };
    });

    // Sort by current price descending
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
    outcomes.sort(
      (a, b) => (priceMap.get(b.tokenId) ?? 0) - (priceMap.get(a.tokenId) ?? 0)
    );

    return { title, outcomes };
  } catch {
    return null;
  }
}

export async function fetchPrice(tokenId: string): Promise<number | null> {
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

export async function fetchStockData(
  ticker: string,
  yahooRange: string,
  yahooInterval: string,
  /** Optional: filter history to only points at or after this Unix timestamp */
  startTs?: number
): Promise<StockSnapshot | null> {
  try {
    const res = await fetch(
      `${PROXY}?endpoint=stock&ticker=${encodeURIComponent(ticker)}&range=${yahooRange}&interval=${yahooInterval}`
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

    // Client-side filter for 1H / 4H (we fetched a full day, trim to window)
    if (startTs && startTs > 0) {
      history = history.filter((pt) => pt.t >= startTs);
    }

    if (history.length === 0) return null;

    const currentPrice = history[history.length - 1].p;
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
    const params =
      startTs > 0
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
