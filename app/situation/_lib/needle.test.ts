import assert from "node:assert/strict";
import { test } from "node:test";
import { COLORS } from "./constants";
import { getNeedleModel, loadNeedleMode, NEEDLE_MODE_KEY, needleRotation, needleVerdict, saveNeedleMode } from "./needle";
import type { MarketInfo, Outcome } from "./types";

const choice = (tokenId: string, name: string, currentPrice: number): Outcome => ({ tokenId, name, currentPrice, history: [], priceIsFresh: true, normalizationSafe: true });
const market = (outcomes: Outcome[], extra: Partial<MarketInfo> = {}): MarketInfo => ({
  title: "Election winner", kind: "multi", mutuallyExclusive: true, normalizationEligible: true,
  outcomeNames: outcomes.map((outcome) => outcome.name), outcomes, ...extra,
});

test("a Democratic favorite points left and a Republican favorite points right regardless of input order", () => {
  const outcomes = [choice("r", "Republican", 0.37), choice("d", "Democratic Party", 0.63)];
  const model = getNeedleModel(market(outcomes), outcomes)!;
  assert.equal(model.left.name, "Democratic Party");
  assert.equal(model.right.name, "Republican");
  assert.equal(model.left.color, COLORS[1]);
  assert.equal(model.right.color, COLORS[3]);
  assert(needleRotation(model.leftProbability) < 0);
  assert.equal(model.headline, "Tilting DEM");
  assert.equal(model.detail, "63% DEM");
  outcomes[0].currentPrice = 0.8;
  outcomes[1].currentPrice = 0.2;
  const republican = getNeedleModel(market(outcomes), outcomes)!;
  assert(needleRotation(republican.leftProbability) > 0);
  assert.equal(republican.headline, "Likely REP");
  assert.equal(republican.detail, "80% REP");
});

test("rotation is bounded, symmetric, centered at 50%, and aligns with the probability bands", () => {
  assert.equal(needleRotation(0), 90);
  assert.equal(needleRotation(1), -90);
  assert.equal(needleRotation(0.5), 0);
  assert.equal(needleRotation(-1), 90);
  assert.equal(needleRotation(2), -90);
  assert.equal(needleRotation(NaN), 0);
  for (const probability of [0.01, 0.05, 0.25, 0.45, 0.63, 0.95, 0.99]) assert(Math.abs(needleRotation(probability) + needleRotation(1 - probability)) < 1e-8);
  assert(Math.abs(needleRotation(0.95) + 64.2857142857) < 1e-8);
});

test("the needle uses the same conservative normalization eligibility as the existing headlines", () => {
  const outcomes = [choice("d", "Democrat", 0.6), choice("r", "Republican", 0.41)];
  const model = getNeedleModel(market(outcomes), outcomes)!;
  assert(Math.abs(model.leftProbability - 0.6 / 1.01) < 1e-10);
  outcomes.forEach((outcome) => { outcome.normalizationSafe = false; });
  assert.equal(getNeedleModel(market(outcomes), outcomes)!.leftProbability, 0.6);
});

test("Yes/No prices remain raw and the selected side's assigned colors are honored", () => {
  const outcomes = [choice("yes", "Yes", 0.73), choice("no", "No", 0.27)];
  const info = market(outcomes, { kind: "binary", normalizationEligible: false });
  const model = getNeedleModel(info, outcomes, { yes: "pink", no: "orange" })!;
  assert.equal(model.leftProbability, 0.73);
  assert.equal(model.left.color, COLORS[5]);
  assert.equal(model.right.color, COLORS[7]);
  assert.equal(model.detail, "73% Yes");
});

test("confidence labels and pointer position follow the displayed favorite price even when raw quotes disagree slightly", () => {
  const outcomes = [choice("d", "Democrat", 0.45), choice("r", "Republican", 0.54)];
  const model = getNeedleModel(market(outcomes, { normalizationEligible: false }), outcomes)!;
  assert.equal(model.headline, "Tossup");
  assert.equal(model.detail, "54% REP");
  assert(Math.abs(model.leftProbability - 0.46) < 1e-9);
});

test("multi-choice needles show a leading option against its complement, never a renormalized top two", () => {
  const outcomes = [choice("a", "Democrat 10-15%", 0.4), choice("b", "Democrat 15-20%", 0.3), choice("c", "Republican Wins", 0.3)];
  const model = getNeedleModel(market(outcomes), outcomes)!;
  assert.equal(model.kind, "leader");
  assert.equal(model.leftProbability, 0.4);
  assert.equal(model.right.probability, 0.6);
  assert.equal(model.right.name, "All other outcomes");
  assert.equal(model.detail, "40% DEM 10-15%");
  assert.equal(model.context, "Leading option vs. rest");
});

test("omitted choices and inconsistent quotes cannot become a fabricated two-person contest", () => {
  const outcomes = [choice("a", "A", 0.52), choice("b", "B", 0.3)];
  const info = market(outcomes, { normalizationEligible: false, outcomeNames: ["A", "B", "C"] });
  assert.equal(getNeedleModel(info, outcomes)?.kind, "leader");
  assert.equal(getNeedleModel(info, outcomes)?.leftProbability, 0.52);
  assert.equal(getNeedleModel(market(outcomes), outcomes)?.kind, "leader");
});

test("independent choices use a single option's yes/no complement rather than implying other choices are exclusive", () => {
  const outcomes = [choice("a", "Option A", 0.7), choice("b", "Option B", 0.6)];
  const model = getNeedleModel(market(outcomes, { mutuallyExclusive: false, normalizationEligible: false }), outcomes)!;
  assert.equal(model.kind, "leader");
  assert.equal(model.leftProbability, 0.7);
  assert.equal(model.right.name, "Not Option A");
  assert.equal(model.context, "Leading option: yes vs. no");
});

test("a red leading option remains on the right even in a multi-choice field", () => {
  const outcomes = [choice("a", "Candidate A", 0.7), choice("b", "Candidate B", 0.2), choice("c", "Candidate C", 0.1)];
  const model = getNeedleModel(market(outcomes), outcomes, { a: "red" })!;
  assert.equal(model.right.name, "Candidate A");
  assert(Math.abs(model.leftProbability - 0.3) < 1e-10);
  assert(needleRotation(model.leftProbability) > 0);
  assert.equal(model.detail, "70% Candidate A");
});

test("missing, invalid or stale prices show no invented needle probability", () => {
  assert.equal(getNeedleModel(market([]), []), null);
  const outcomes = [choice("a", "A", 0.6), choice("b", "B", 0.4)];
  for (const price of [NaN, Infinity, -1, 2]) {
    outcomes[0].currentPrice = price;
    assert.equal(getNeedleModel(market(outcomes), outcomes), null);
  }
  outcomes[0].currentPrice = 0.6;
  outcomes[0].priceIsFresh = false;
  assert.equal(getNeedleModel(market(outcomes), outcomes), null);
});

test("tied and near-tied contests are tossups and certainty is never labeled as a called result", () => {
  const outcomes = [choice("a", "Candidate A", 0.5), choice("b", "Candidate B", 0.5)];
  assert.equal(getNeedleModel(market(outcomes), outcomes)?.headline, "Tossup");
  assert.equal(getNeedleModel(market(outcomes), outcomes)?.detail, "50% each");
  assert.equal(needleVerdict(0.54), "Tossup");
  assert.equal(needleVerdict(0.55), "Tilting");
  assert.equal(needleVerdict(0.65), "Leaning");
  assert.equal(needleVerdict(0.75), "Likely");
  assert.equal(needleVerdict(0.95), "Very likely");
  assert.equal(needleVerdict(1), "Very likely");
});

test("Needle is a local display preference and blocked storage cannot break the toggle", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } } });
    assert.equal(loadNeedleMode(), false);
    saveNeedleMode(true);
    assert.equal(values.get(NEEDLE_MODE_KEY), "true");
    assert.equal(loadNeedleMode(), true);
    saveNeedleMode(false);
    assert.equal(loadNeedleMode(), false);
    Object.defineProperty(globalThis, "window", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(loadNeedleMode(), false);
    assert.doesNotThrow(() => saveNeedleMode(true));
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
