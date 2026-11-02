import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestCache } from "./requestCache";

test("shared requests coalesce in flight, cache briefly, and expire", async () => {
  let now = 0;
  let calls = 0;
  const cache = createRequestCache<number>(2, () => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.get("a", 100, load), cache.get("a", 100, load)]), [1, 1]);
  now = 99;
  assert.equal(await cache.get("a", 100, load), 1);
  now = 100;
  assert.equal(await cache.get("a", 100, load), 2);
});

test("failed requests and unavailable results do not become successful cached data", async () => {
  const cache = createRequestCache<number | null>();
  await assert.rejects(cache.get("a", 1000, async () => { throw new Error("offline"); }));
  assert.equal(await cache.get("a", 1000, async () => null, (value) => value !== null), null);
  assert.equal(await cache.get("a", 1000, async () => 4), 4);
});

test("the cache evicts least recently used completed entries", async () => {
  const cache = createRequestCache<number>(2);
  await cache.get("a", 1000, async () => 1);
  await cache.get("b", 1000, async () => 2);
  await cache.get("a", 1000, async () => 99);
  await cache.get("c", 1000, async () => 3);
  assert.equal(await cache.get("b", 1000, async () => 22), 22);
});
