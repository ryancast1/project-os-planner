import type { MarketInfo, Outcome, PolymarketQuote, PricePoint } from "./types";

type GammaMarket = {
  question?: string;
  groupItemTitle?: string;
  outcomes?: string | string[];
  outcomePrices?: string | (string | number)[];
  clobTokenIds?: string | string[];
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
};

export type GammaEvent = {
  title?: string;
  markets?: GammaMarket[];
  negRisk?: boolean;
  negRiskAugmented?: boolean;
};

export function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseProbability(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") value = Number(value);
  return isProbability(value) ? value : null;
}

function parseList(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStrings(value: unknown): string[] {
  const parsed = parseList(value);
  return parsed.every((item): item is string => typeof item === "string") ? parsed : [];
}

function marketOutcomes(market: GammaMarket): Outcome[] {
  const names = parseStrings(market.outcomes);
  const tokens = parseStrings(market.clobTokenIds);
  const prices = parseList(market.outcomePrices);
  if (names.length < 2 || names.length !== tokens.length || tokens.some((token) => !token)) return [];
  return names.map((name, i) => ({
    name,
    tokenId: tokens[i],
    currentPrice: parseProbability(prices[i]) ?? NaN,
    history: [],
    normalizationSafe: false,
  }));
}

function isYesNo(outcomes: Outcome[]): boolean {
  return outcomes.length === 2 &&
    outcomes.some((outcome) => outcome.name.trim().toLowerCase() === "yes") &&
    outcomes.some((outcome) => outcome.name.trim().toLowerCase() === "no");
}

export function buildPolymarketInfo(event: GammaEvent, slug: string): MarketInfo | null {
  const markets = event.markets;
  if (!Array.isArray(markets) || markets.length === 0) return null;
  const title = event.title ?? slug;

  // Classify the original event before filtering; one remaining candidate is
  // still a candidate, not a new Yes/No market.
  if (markets.length === 1) {
    const market = markets[0];
    if (market.active === false || market.closed || market.archived) return null;
    const outcomes = marketOutcomes(market);
    if (!outcomes.length) return null;
    const binary = isYesNo(outcomes);
    if (binary) {
      outcomes.sort((a) => a.name.trim().toLowerCase() === "yes" ? -1 : 1);
      outcomes[0].name = "Yes";
      outcomes[1].name = "No";
    }
    return {
      title: market.question ?? title,
      outcomes,
      kind: binary ? "binary" : "multi",
      normalizationEligible: !binary,
      mutuallyExclusive: true,
      outcomeNames: outcomes.map((outcome) => outcome.name),
    };
  }

  const outcomes: Outcome[] = [];
  const outcomeNames: string[] = [];
  const activeMarkets = markets.filter((market) => market.active !== false);
  const liveMarkets = activeMarkets.filter((market) => !market.closed && !market.archived);
  for (const market of liveMarkets) {
    const choices = marketOutcomes(market);
    if (!isYesNo(choices)) continue;
    const yes = choices.find((choice) => choice.name.trim().toLowerCase() === "yes")!;
    const name = market.groupItemTitle || (market.question ?? "")
      .replace(/^Will (the )?/i, "")
      .replace(/\?$/, "")
      .replace(/ win .+$/, "") || "Outcome";
    outcomeNames.push(name);
    // Keep both sides of a two-choice race, including a zero-priced longshot.
    // Larger fields retain their existing low-price cutoff.
    if (!isProbability(yes.currentPrice) || (liveMarkets.length !== 2 && yes.currentPrice <= 0.005)) continue;
    outcomes.push({
      ...yes,
      name,
    });
  }
  if (!outcomes.length) return null;
  outcomes.sort((a, b) => b.currentPrice - a.currentPrice);
  return {
    title,
    outcomes,
    kind: "multi",
    // Inactive slots are not live alternatives. Augmented events can normalize
    // their named choices only when every slot has an explicit activity flag.
    normalizationEligible: event.negRisk === true && outcomes.length === activeMarkets.length &&
      (event.negRiskAugmented !== true || markets.every((market) => typeof market.active === "boolean")),
    mutuallyExclusive: event.negRisk === true,
    outcomeNames,
  };
}

export function getPolymarketQuote(book: {
  bids?: { price?: unknown; size?: unknown }[];
  asks?: { price?: unknown; size?: unknown }[];
  last_trade_price?: unknown;
}, lastTradePrice?: unknown): PolymarketQuote | null {
  function prices(levels: { price?: unknown; size?: unknown }[] | undefined): number[] {
    if (!Array.isArray(levels)) return [];
    return levels.flatMap((level) => {
      if (!level || typeof level !== "object") return [];
      const price = parseProbability(level.price);
      const size = Number(level.size);
      return price != null && Number.isFinite(size) && size > 0 ? [price] : [];
    });
  }
  const bids = prices(book.bids);
  const asks = prices(book.asks);
  const bid = bids.length ? Math.max(...bids) : null;
  const ask = asks.length ? Math.min(...asks) : null;
  // Match Polymarket's displayed probability: midpoint for tight books,
  // last trade for spreads wider than ten cents (or a missing book side).
  if (bid != null && ask != null && bid <= ask && ask - bid <= 0.1 + 1e-9) {
    return { price: (bid + ask) / 2, normalizationSafe: true };
  }
  // The book's last_trade_price can refer to the other token in the market.
  // Only trust a last trade fetched explicitly for this token.
  const last = parseProbability(lastTradePrice);
  return last != null ? { price: last, normalizationSafe: false } : null;
}

export function getCurrentPolymarketPrice(
  quote: PolymarketQuote | null,
  history: PricePoint[],
  previous: number,
  now: number,
): number {
  if (quote && isProbability(quote.price)) return quote.price;
  return recentHistoryPrice(history, now) ?? previous;
}

function recentHistoryPrice(history: PricePoint[], now: number): number | null {
  const latest = history[history.length - 1];
  if (latest && isProbability(latest.p) && latest.t <= now && now - latest.t <= 15 * 60) return latest.p;
  return null;
}

export function hasFreshPolymarketPrice(quote: PolymarketQuote | null, history: PricePoint[], now: number): boolean {
  return (quote != null && isProbability(quote.price)) || recentHistoryPrice(history, now) != null;
}
