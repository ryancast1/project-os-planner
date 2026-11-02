import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBatchedPrice, fetchPriceHistory } from "./api";

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
