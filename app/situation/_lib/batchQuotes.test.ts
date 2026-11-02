import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBatchQuotes, parseBatchTokenIds } from "./batchQuotes";

const book = (asset_id: string, bid = "0.59", ask = "0.61") => ({ asset_id, bids: [{ price: bid, size: "10" }], asks: [{ price: ask, size: "10" }] });

test("batch books are matched by token ID rather than response order", async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (url) => {
    calls.push(String(url));
    return Response.json([book("b", "0.39", "0.41"), book("a")]);
  };
  const quotes = await loadBatchQuotes(["a", "b"], request);
  assert.deepEqual(quotes, { a: { price: 0.6, normalizationSafe: true }, b: { price: 0.4, normalizationSafe: true } });
  assert.equal(calls.length, 1);
});

test("wide or missing books use token-specific batched last trades, not the book's last trade", async () => {
  const calls: { path: string; ids: string[] }[] = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({ path: new URL(String(url)).pathname, ids: JSON.parse(String(init?.body)).map((row: { token_id: string }) => row.token_id) });
    return Response.json(String(url).endsWith("/books")
      ? [{ ...book("a", "0.2", "0.8"), last_trade_price: "0.99" }, book("b")]
      : [{ token_id: "a", price: "0.45" }, { token_id: "missing", price: "0.12" }]);
  };
  const quotes = await loadBatchQuotes(["a", "b", "missing"], request);
  assert.deepEqual(quotes.a, { price: 0.45, normalizationSafe: false });
  assert.deepEqual(quotes.missing, { price: 0.12, normalizationSafe: false });
  assert.deepEqual(calls[1].ids, ["a", "missing"]);
});

test("one unavailable token is isolated so healthy books keep midpoint prices", async () => {
  const request: typeof fetch = async (url, init) => {
    const ids: { token_id: string }[] = JSON.parse(String(init?.body));
    if (String(url).endsWith("/last-trades-prices")) return Response.json([]);
    return ids.some((row) => row.token_id === "bad") ? new Response(null, { status: 404 }) : Response.json(ids.map((row) => book(row.token_id)));
  };
  const quotes = await loadBatchQuotes(["a", "bad", "b"], request);
  assert.equal(quotes.a?.price, 0.6);
  assert.equal(quotes.b?.price, 0.6);
  assert.equal(quotes.bad, null);
});

test("total upstream failures have bounded retries and never fabricate prices", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return new Response(null, { status: 404 }); };
  const quotes = await loadBatchQuotes(Array.from({ length: 100 }, (_, i) => String(i)), request);
  assert(calls <= 16);
  assert(Object.values(quotes).every((quote) => quote === null));
});

test("batch input is bounded, validated and deduplicated", () => {
  assert.deepEqual(parseBatchTokenIds({ tokenIds: ["123", "456", "123"] }), ["123", "456"]);
  for (const value of [null, {}, { tokenIds: [] }, { tokenIds: [null] }, { tokenIds: ["a?b"] }, { tokenIds: Array(501).fill("1") }]) assert.equal(parseBatchTokenIds(value), null);
});
