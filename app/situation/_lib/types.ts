// -- Existing types (extracted from page.tsx) --

export type PricePoint = { t: number; p: number };

export type Outcome = {
  name: string;
  tokenId: string;
  currentPrice: number;
  history: PricePoint[];
};

export type MarketInfo = {
  title: string;
  outcomes: Outcome[];
};

// -- New types for Situation 2.0 --

export type SavedMarket = {
  id: string;
  user_id: string;
  label: string;
  slug: string;
  source: string;
  created_at: string;
};

export type LayoutMode = "1" | "2" | "2x2" | "3x2" | "4x2";

export type TimeRangeLabel = "1H" | "4H" | "1D" | "1W" | "1M" | "3M" | "All";

/** Each slot holds a saved-market ID or null (empty) */
export type PanelSlot = string | null;

export type DataSource = "polymarket" | "stock" | "fred" | "crypto" | "kalshi";

export type BuiltinMarket = {
  id: string;      // e.g. "builtin:sp500"
  label: string;   // e.g. "S&P 500"
  ticker: string;  // Yahoo Finance ticker e.g. "^GSPC"
  category: string; // e.g. "Stocks"
};

export type StockSnapshot = {
  label: string;
  ticker: string;
  currentPrice: number;
  previousClose: number | null;
  history: PricePoint[];
};

export type SavedView = {
  id: string;
  user_id: string;
  title: string;
  layout: LayoutMode;
  panels: PanelSlot[];
  created_at: string;
};
