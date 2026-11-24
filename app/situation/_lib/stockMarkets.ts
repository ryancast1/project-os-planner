import { BUILTIN_MARKETS, getTradingSession, US_EQUITY_BUILTIN_IDS } from "./constants";
import type { SavedMarket } from "./types";

export function normalizeStockTicker(input: string): string | null {
  const ticker = input.trim().replace(/^\$/, "").toUpperCase();
  return ticker.length <= 32 && /^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/.test(ticker) ? ticker : null;
}

export type StockMarket = {
  ticker: string;
  label: string;
  includePrePost: boolean;
  continuousTrading: boolean;
  displayType?: "price" | "yield";
  session: ReturnType<typeof getTradingSession>;
};

export function getStockMarket(marketId: string | null, savedMarket?: SavedMarket): StockMarket | null {
  const builtin = BUILTIN_MARKETS.find((market) => market.id === marketId);
  if (builtin) return {
    ticker: builtin.ticker,
    label: builtin.label,
    includePrePost: !US_EQUITY_BUILTIN_IDS.has(builtin.id),
    continuousTrading: builtin.continuousTrading === true,
    displayType: builtin.displayType,
    session: getTradingSession(builtin.id),
  };
  if (!marketId || savedMarket?.id !== marketId || savedMarket.source !== "stock") return null;
  const ticker = normalizeStockTicker(savedMarket.slug);
  if (!ticker) return null;
  return {
    ticker,
    label: savedMarket.label.trim() || ticker,
    includePrePost: false,
    continuousTrading: false,
    // Exchange-suffixed symbols may trade outside US hours; do not pin them to NYSE.
    session: ticker.includes(".") ? null : getTradingSession("builtin:sp500"),
  };
}
