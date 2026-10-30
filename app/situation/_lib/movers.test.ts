import assert from "node:assert/strict";
import { test } from "node:test";
import { COLORS, COLOR_GREEN, COLOR_RED } from "./constants";
import { combineMoverHistories, describeMover, getMissingMoverTokens, getMoverBaseline, getMoverWindow, getPolymarketMover, getStockMover, getTopMovers, hasStockMoverCoverage, isMoverEligibleMarket, mergeMoverHistory, type MarketMover, type MoverRange } from "./movers";
import type { MarketInfo, Outcome, PricePoint } from "./types";

const now = 1_800_000_000;
const outcome = (tokenId: string, name: string, price: number): Outcome => ({ tokenId, name, currentPrice: price, priceIsFresh: true, history: [] });
const market = (outcomes: Outcome[], kind: "binary" | "multi" = "multi"): MarketInfo => ({
  title: "Race", kind, outcomes, mutuallyExclusive: true, normalizationEligible: false,
});
const history = (range: MoverRange, p: number): PricePoint[] => [{ t: getMoverWindow(range, now).target, p }];
const candidate = (marketId: string, score: number, extra: Partial<MarketMover> = {}): MarketMover => ({
  marketId, score, change: score, range: "10M", color: COLORS[0], outcomeName: "A", unit: "pp", asOf: now, ...extra,
});

test("two- and three-outcome markets remain eligible for Movers", () => {
  for (const count of [2, 3]) {
    const outcomes = Array.from({ length: count }, (_, i) => outcome(String(i), `Choice ${i}`, 0.6));
    assert.equal(isMoverEligibleMarket(market(outcomes)), true);
    assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes,
      { "0": history("10M", 0.3) }, now)?.score, 30);
  }
});

test("markets with four or more outcomes cannot qualify, even with only two visible choices", () => {
  const outcomes = Array.from({ length: 4 }, (_, i) => outcome(String(i), `Choice ${i}`, 0.2));
  assert.equal(isMoverEligibleMarket(market(outcomes)), false);
  assert.equal(isMoverEligibleMarket(market(outcomes), outcomes.slice(0, 2)), false);
  assert.equal(isMoverEligibleMarket(market(outcomes.slice(0, 2)), outcomes), false);
  assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes.slice(0, 2),
    { "0": history("10M", 0.01) }, now), null);
});

test("active low-price choices count toward the limit even when omitted from fetched outcomes", () => {
  const outcomes = [outcome("a", "A", 0.7), outcome("b", "B", 0.3)];
  const info = { ...market(outcomes), outcomeNames: ["A", "B", "Low price C", "Low price D"] };
  assert.equal(isMoverEligibleMarket(info), false);
  assert.equal(getPolymarketMover("race", "10M", info, outcomes, outcomes, { a: history("10M", 0.1) }, now), null);
});

test("each mover window is rolling and independent of chart range or midnight", () => {
  for (const [range, duration] of [["1D", 86400], ["1H", 3600], ["10M", 600]] as const) {
    const window = getMoverWindow(range, now);
    assert.equal(window.target, now - duration);
    assert.ok(window.start < window.target);
    assert.equal(getMoverWindow(range, now + 3600).target, window.target + 3600);
  }
});

test("baseline is the most recent valid point at or before target, regardless of ordering", () => {
  assert.deepEqual(getMoverBaseline([{ t: 990, p: 0.2 }, { t: 1001, p: 0.9 }, { t: 995, p: 0.3 },
    { t: 996, p: NaN }, { t: NaN, p: 0.5 }], 1000, 20), { t: 995, p: 0.3 });
  assert.equal(getMoverBaseline([{ t: 900, p: 0.5 }, { t: 1001, p: 0.6 }], 1000, 20), null);
  assert.equal(getMoverBaseline([], 1000, 20), null);
});

test("loaded chart history calculates movers immediately with no supplemental tokens", () => {
  const outcomes = [outcome("a", "A", 0.6), outcome("b", "B", 0.4)];
  outcomes[0].history = history("10M", 0.5);
  outcomes[1].history = history("10M", 0.5);
  const histories = combineMoverHistories(outcomes, {});
  assert.deepEqual(getMissingMoverTokens(outcomes, histories, "10M", now), []);
  assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, histories, now)?.score, 10);
});

test("only outcomes lacking a sufficiently precise baseline need supplemental history", () => {
  const outcomes = [outcome("a", "A", 0.6), outcome("b", "B", 0.4), outcome("c", "C", 0.1)];
  outcomes[0].history = history("10M", 0.5);
  outcomes[1].history = [{ t: now - 720, p: 0.4 }];
  const histories = combineMoverHistories(outcomes, {});
  assert.deepEqual(getMissingMoverTokens(outcomes, histories, "10M", now), ["b", "c"]);
  assert.deepEqual(getMissingMoverTokens(outcomes, combineMoverHistories(outcomes, {
    b: [{ t: now - 630, p: 0.5 }], c: history("10M", 0.05),
  }), "10M", now), []);
});

test("cached comparison points survive toggling windows without replacing chart history", () => {
  const outcomes = [outcome("a", "A", 0.7)];
  outcomes[0].history = [{ t: now, p: 0.7 }];
  const cache = { a: [...history("1D", 0.4), ...history("1H", 0.5), ...history("10M", 0.6)] };
  const histories = combineMoverHistories(outcomes, cache);
  for (const range of ["1D", "1H", "10M"] as const)
    assert.deepEqual(getMissingMoverTokens(outcomes, histories, range, now), []);
  assert.equal(outcomes[0].history.length, 1);
  assert.equal(cache.a.length, 3);
});

test("comparison cache merges, deduplicates, sorts and bounds its memory", () => {
  assert.deepEqual(mergeMoverHistory([{ t: 2, p: 0.2 }], [{ t: 1, p: 0.1 }, { t: 2, p: 0.3 }, { t: NaN, p: 0.5 }]),
    [{ t: 1, p: 0.1 }, { t: 2, p: 0.3 }]);
  const bounded = mergeMoverHistory([], Array.from({ length: 3000 }, (_, t) => ({ t, p: 0.5 })));
  assert.equal(bounded.length, 2048);
  assert.equal(bounded[0].t, 952);
});

test("prediction market score is raw percentage-point gain, not relative or normalized change", () => {
  const outcomes = [outcome("tiny", "Tiny", 0.02), outcome("a", "A", 0.65), outcome("b", "B", 0.4)];
  const mover = getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, {
    tiny: history("10M", 0.01), a: history("10M", 0.5), b: history("10M", 0.5),
  }, now)!;
  assert.equal(mover.outcomeName, "A");
  assert.equal(mover.score, 15);
  assert.equal(mover.color, COLORS[1]);
  assert.equal(mover.unit, "pp");
});

test("a binary No gain can win even though the chart only draws Yes", () => {
  const outcomes = [outcome("yes", "Yes", 0.2), outcome("no", "No", 0.8)];
  const mover = getPolymarketMover("binary", "1H", market(outcomes, "binary"), outcomes, outcomes.slice(0, 1), {
    yes: history("1H", 0.7), no: history("1H", 0.3),
  }, now, { no: "red" })!;
  assert.equal(mover.outcomeName, "No");
  assert.equal(mover.score, 50);
  assert.equal(mover.color, COLORS[3]);
});

test("movers respect visible palette positions, explicit party names and manual overrides", () => {
  const outcomes = [outcome("a", "Small", 0.01), outcome("b", "Candidate (D)", 0.7), outcome("c", "Candidate (R)", 0.3)];
  const histories = { b: history("1D", 0.5) };
  assert.equal(getPolymarketMover("race", "1D", market(outcomes), outcomes, outcomes.slice(1), histories, now)?.color, COLORS[1]);
  assert.equal(getPolymarketMover("race", "1D", market(outcomes), outcomes, outcomes.slice(1), histories, now, { b: "pink" })?.color, COLORS[5]);
  outcomes[1].name = "Winner";
  assert.equal(getPolymarketMover("race", "1D", market(outcomes), outcomes, outcomes.slice(1), histories, now)?.color, COLORS[0]);
});

test("multiple same-party choices preserve their chart palette rather than forcing party color", () => {
  const outcomes = [outcome("a", "Democrat 0-5", 0.2), outcome("b", "Democrat 5-10", 0.7)];
  assert.equal(getPolymarketMover("margin", "10M", market(outcomes), outcomes, outcomes, { a: history("10M", 0.1) }, now)?.color, COLORS[0]);
});

test("no movement, missing baseline, invalid or stale quotes do not create movers", () => {
  const outcomes = [outcome("a", "A", 0.5)];
  for (const baseline of [0.5, NaN, -1, 2])
    assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, { a: history("10M", baseline) }, now), null);
  assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, {}, now), null);
  outcomes[0].priceIsFresh = false;
  assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, { a: history("10M", 0.1) }, now), null);
  outcomes[0].priceIsFresh = true;
  outcomes[0].currentPrice = NaN;
  assert.equal(getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, { a: history("10M", 0.1) }, now), null);
});

test("a falling market still qualifies when the opposite book has not repriced", () => {
  const outcomes = [outcome("d", "Candidate (D)", 0.7), outcome("r", "Candidate (R)", 0.29)];
  const mover = getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, {
    d: history("10M", 0.71), r: history("10M", 0.29),
  }, now)!;
  assert.equal(mover.score, 1);
  assert.equal(mover.change, -1);
  assert.equal(mover.color, COLORS[1]);
  assert.equal(describeMover(mover), "Top mover over 10 min: Candidate (D) -1.00 percentage points.");
});

test("ranking uses the biggest absolute move while the ring prefers the gaining side", () => {
  const outcomes = [outcome("a", "A", 0.4), outcome("b", "B", 0.55)];
  const mover = getPolymarketMover("race", "1H", market(outcomes), outcomes, outcomes, {
    a: history("1H", 0.5), b: history("1H", 0.5),
  }, now)!;
  assert.equal(mover.score, 10);
  assert.equal(mover.change, 5);
  assert.equal(mover.outcomeName, "B");
  assert.equal(mover.color, COLORS[1]);
});

test("stock scores use absolute percent moves, green for rises and red for declines", () => {
  const snapshot = { label: "Stock", ticker: "TEST", currentPrice: 106, previousClose: 99,
    history: [...history("10M", 100), { t: now - 60, p: 106 }] };
  const up = getStockMover("stock", "10M", snapshot, now)!;
  assert.ok(Math.abs(up.score - 6) < 1e-9);
  assert.equal(up.color, COLOR_GREEN);
  snapshot.history[1].p = 90;
  const down = getStockMover("stock", "10M", snapshot, now)!;
  assert.ok(Math.abs(down.change + 10) < 1e-9);
  assert.equal(down.color, COLOR_RED);
  assert.equal(down.unit, "%");
});

test("closed, flat, missing-baseline, or zero-baseline stocks are omitted", () => {
  const snapshot = { label: "Stock", ticker: "TEST", currentPrice: 100, previousClose: 99, history: history("10M", 100) };
  assert.equal(getStockMover("stock", "10M", snapshot, now), null);
  snapshot.history.push({ t: now, p: 100 });
  assert.equal(hasStockMoverCoverage("10M", snapshot, now), true);
  assert.equal(getStockMover("stock", "10M", snapshot, now), null);
  snapshot.history[0].p = 0;
  assert.equal(getStockMover("stock", "10M", snapshot, now), null);
  snapshot.history.shift();
  assert.equal(getStockMover("stock", "10M", snapshot, now), null);
});

test("ranking takes five unique qualifying markets, with deterministic ties and fresh matching range", () => {
  const candidates = [candidate("d", 2), candidate("b", 5), candidate("a", 5), candidate("c", 4),
    candidate("e", 3), candidate("f", 3.5), candidate("g", 3.1), candidate("h", 3),
    candidate("b", 3, { asOf: now - 10 }), candidate("hidden", 99), candidate("old", 99, { asOf: now - 91 }),
    candidate("future", 99, { asOf: now + 1 }), candidate("wrong", 99, { range: "1D" }), candidate("nan", NaN), null];
  assert.deepEqual(getTopMovers(candidates, "10M", ["a", "b", "c", "d", "e", "f", "g", "h", "old", "future", "wrong", "nan"], now).map((mover) => mover.marketId), ["a", "b", "c", "f", "g"]);
  assert.deepEqual(getTopMovers(candidates, null, ["a"], now), []);
  assert.deepEqual(getTopMovers(candidates, "10M", ["a"], now + 91), []);
  assert.deepEqual(getTopMovers([candidate("a", 0)], "10M", ["a"], now), []);
});

test("the minimum is inclusive at three percentage points and never fills remaining slots with smaller moves", () => {
  const candidates = [candidate("below", 2.999), candidate("exact", 3), candidate("above", 3.001),
    candidate("negative", 3, { change: -3 }), candidate("tiny", 0.1)];
  assert.deepEqual(getTopMovers(candidates, "10M", candidates.map((mover) => mover.marketId), now)
    .map((mover) => mover.marketId), ["above", "exact", "negative"]);
  assert.deepEqual(getTopMovers(candidates, "10M", ["below", "tiny"], now), []);
});

test("prediction-market threshold uses raw cents, not relative growth or a rounded display", () => {
  const outcomes = [outcome("a", "A", 0.52999), outcome("b", "B", 0.03)];
  const mover = getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, {
    a: history("10M", 0.5), b: history("10M", 0.01),
  }, now)!;
  assert.deepEqual(getTopMovers([mover], "10M", ["race"], now), []);
  outcomes[0].currentPrice = 0.53;
  const qualifying = getPolymarketMover("race", "10M", market(outcomes), outcomes, outcomes, {
    a: history("10M", 0.5), b: history("10M", 0.01),
  }, now)!;
  assert.equal(getTopMovers([qualifying], "10M", ["race"], now).length, 1);
});

test("ring descriptions explain the selected window, rising outcome, and change", () => {
  assert.equal(describeMover(candidate("race", 5)), "Top mover over 10 min: A +5.00 percentage points.");
  assert.equal(describeMover(candidate("stock", 5, { change: -5, unit: "%", range: "1D" })), "Top mover over 1 day: A -5.00%.");
});
