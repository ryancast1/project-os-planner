import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuoteBatcher } from "./quoteBatcher";

const quote = { price: 0.6, normalizationSafe: true };

test("56 outcomes and duplicate cards share one quote request every refresh", async () => {
  let now = 0;
  const calls: string[][] = [];
  const get = createQuoteBatcher(async (tokens) => {
    calls.push(tokens);
    return Object.fromEntries(tokens.map((token) => [token, quote]));
  }, { delayMs: 0, now: () => now });
  const tokens = Array.from({ length: 56 }, (_, i) => String(i));
  const values = await Promise.all([...tokens, "1", "2"].map(get));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 56);
  assert(values.every((value) => value === quote));
  now = 3000;
  await get("1");
  assert.equal(calls.length, 1);
  now = 12_000;
  await Promise.all(tokens.map(get));
  assert.equal(calls.length, 2);
});

test("missing quotes and batch errors resolve unavailable and retry on the next refresh", async () => {
  let calls = 0;
  const get = createQuoteBatcher(async () => {
    if (++calls === 1) throw new Error("offline");
    return { good: quote };
  }, { delayMs: 0 });
  assert.equal(await get("good"), null);
  assert.equal(await get("good"), quote);
  assert.equal(await get("missing"), null);
});

test("large grids split quote batches at the upstream 500-token limit", async () => {
  const sizes: number[] = [];
  const get = createQuoteBatcher(async (tokens) => {
    sizes.push(tokens.length);
    return {};
  }, { delayMs: 0 });
  await Promise.all(Array.from({ length: 501 }, (_, i) => get(String(i))));
  assert.deepEqual(sizes, [500, 1]);
});
