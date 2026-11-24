import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBatchedPrice, fetchPriceHistory, fetchStockData, lookupStock } from "./api";

test("the batched client validates each quote independently and retains normalization quality", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert(String(url).endsWith("endpoint=prices"));
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)).tokenIds, ["client-a", "client-b", "client-c"]);
      return Response.json({ quotes: {
        "client-a": { price: "0.55", normalizationSafe: true },
        "client-b": { price: "0.45" },
        "client-c": { price: "invalid", normalizationSafe: true },
      } });
    };
    assert.deepEqual(await Promise.all(["client-a", "client-b", "client-c"].map(fetchBatchedPrice)), [
      { price: 0.55, normalizationSafe: true }, { price: 0.45, normalizationSafe: false }, null,
    ]);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("stock lookup validates the symbol and retrieves a default company name or ETF label", async () => {
  const original = globalThis.fetch;
  try {
    for (const instrumentType of ["EQUITY", "ETF"]) {
      globalThis.fetch = async (input) => {
        const query = new URL(String(input), "http://localhost").searchParams;
        assert.equal(query.get("endpoint"), "stock");
        assert.equal(query.get("ticker"), "AAPL");
        assert.equal(query.get("range"), "1mo");
        return Response.json({ chart: { result: [{ meta: { symbol: "AAPL", instrumentType, longName: " Apple Inc. ", regularMarketPrice: 250 } }] } });
      };
      assert.deepEqual(await lookupStock(" $aapl "), { ticker: "AAPL", label: "Apple Inc." });
    }
    globalThis.fetch = async () => Response.json({ chart: { result: [{ meta: { symbol: "SPY", shortName: "S&P fund" }, indicators: { quote: [{ close: [null, 600] }] } }] } });
    assert.deepEqual(await lookupStock("SPY"), { ticker: "SPY", label: "S&P fund" });
  } finally { globalThis.fetch = original; }
});

test("stock lookup rejects invalid, mismatched, unavailable, unpriced and non-stock instruments", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Invalid input should not request anything"); };
    assert.equal(await lookupStock("AAPL&range=max"), null);
    for (const result of [null, { meta: { symbol: "OTHER", regularMarketPrice: 100 } }, { meta: { symbol: "AAPL", instrumentType: "CRYPTOCURRENCY", regularMarketPrice: 100 } }, { meta: { symbol: "AAPL", regularMarketPrice: null }, indicators: { quote: [{ close: [null, "100", NaN] }] } }]) {
      globalThis.fetch = async () => Response.json({ chart: { result: [result] } });
      assert.equal(await lookupStock("AAPL"), null);
    }
    globalThis.fetch = async () => Response.json({ error: "Rate limited" }, { status: 429 });
    assert.equal(await lookupStock("AAPL"), null);
    globalThis.fetch = async () => { throw new Error("Offline"); };
    assert.equal(await lookupStock("AAPL"), null);
  } finally { globalThis.fetch = original; }
});

test("stock history still trims rolling windows and rejects windows without chart data", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ chart: { result: [{
      timestamp: [900, 1100], indicators: { quote: [{ close: [100, 101] }] },
      meta: { regularMarketPrice: 102, previousClose: 99 },
    }] } });
    const snapshot = await fetchStockData("rolling-stock", "1d", "2m", 1000, true);
    assert.deepEqual(snapshot?.history, [{ t: 1100, p: 101 }]);
    assert.equal(snapshot?.currentPrice, 101);
    assert.equal(snapshot?.previousClose, 99);
    assert.equal(await fetchStockData("empty-stock", "1d", "2m", 1200), null);
  } finally { globalThis.fetch = original; }
});

test("shared minute-aligned history is trimmed to each caller and rejects malformed points", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      const query = new URL(String(url), "http://localhost").searchParams;
      assert.equal(query.get("startTs"), "600");
      assert.equal(query.get("endTs"), "1140");
      return Response.json({ history: [{ t: 600, p: 0.1 }, { t: 660, p: "0.2" }, { t: 1080, p: 0.3 }, { t: 1140, p: 0.4 }, null, { t: 700, p: 2 }] });
    };
    const [a, b] = await Promise.all([
      fetchPriceHistory("history-client", 601, 1121, 1),
      fetchPriceHistory("history-client", 620, 1139, 1),
    ]);
    assert.deepEqual(a, [{ t: 660, p: 0.2 }, { t: 1080, p: 0.3 }]);
    assert.deepEqual(b, a);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
