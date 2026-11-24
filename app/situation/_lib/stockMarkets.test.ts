import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_MARKETS, getTradingSession, US_EQUITY_BUILTIN_IDS } from "./constants";
import { getStockMarket, normalizeStockTicker } from "./stockMarkets";
import type { SavedMarket } from "./types";

const saved: SavedMarket = { id: "saved-stock", user_id: "owner", source: "stock", slug: "AAPL", label: "Apple", created_at: "2026-11-24" };

test("stock symbols normalize case, whitespace and optional dollar prefixes", () => {
  for (const [input, expected] of [[" aapl ", "AAPL"], ["$msft", "MSFT"], ["brk-b", "BRK-B"], ["0700.hk", "0700.HK"], ["SPY", "SPY"]]) {
    assert.equal(normalizeStockTicker(input), expected);
  }
  for (const input of ["", " ", "Apple Inc", "https://example.com", "AAPL&range=max", "../AAPL", "AAPL/", "A--B", "$", "X".repeat(33)]) {
    assert.equal(normalizeStockTicker(input), null);
  }
});

test("saved stocks use the existing price path, regular session, and a user label", () => {
  assert.deepEqual(getStockMarket(saved.id, saved), {
    ticker: "AAPL", label: "Apple", includePrePost: false, continuousTrading: false, session: getTradingSession("builtin:sp500"),
  });
  assert.equal(getStockMarket(saved.id, { ...saved, label: " ", slug: " msft " })?.label, "MSFT");
  assert.equal(getStockMarket(saved.id, { ...saved, slug: "0700.HK" })?.session, null);
});

test("saved stocks cannot be confused with prediction markets, unrelated rows or invalid symbols", () => {
  assert.equal(getStockMarket(saved.id, { ...saved, source: "polymarket" }), null);
  assert.equal(getStockMarket("different-id", saved), null);
  assert.equal(getStockMarket(null, saved), null);
  assert.equal(getStockMarket(saved.id, { ...saved, slug: "bad/symbol" }), null);
  assert.equal(getStockMarket(saved.id), null);
});

test("every built-in retains its ticker, label, yield format, session and extended-hours behavior", () => {
  for (const builtin of BUILTIN_MARKETS) {
    assert.deepEqual(getStockMarket(builtin.id), {
      ticker: builtin.ticker, label: builtin.label, includePrePost: !US_EQUITY_BUILTIN_IDS.has(builtin.id),
      displayType: builtin.displayType, session: getTradingSession(builtin.id),
      continuousTrading: builtin.continuousTrading === true,
    });
  }
});
