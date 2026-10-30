import assert from "node:assert/strict";
import { test } from "node:test";
import { COLORS } from "./constants";
import type { Outcome } from "./types";
import {
  clearLocalOutcomeColors,
  getOutcomeColor,
  getOutcomeColors,
  loadLocalOutcomeColors,
  sanitizeOutcomeColors,
  saveLocalOutcomeColors,
} from "./colors";

const alice: Outcome = { name: "Alice", tokenId: "alice-token", currentPrice: 0.6, history: [] };
const bob: Outcome = { name: "Bob", tokenId: "bob-token", currentPrice: 0.4, history: [] };

test("unconfigured outcomes keep the existing palette", () => {
  assert.deepEqual(getOutcomeColors([alice, bob]), COLORS.slice(0, 2));
  assert.deepEqual(getOutcomeColors([alice, bob], {}), COLORS.slice(0, 2));
});

test("explicit party labels default to blue or red, ignoring case", () => {
  for (const name of ["Alice (D)", "Alice ( d )", "Democrat", "Democratic Party", "Democrats", "DEMOCRAT 10-15%"])
    assert.equal(getOutcomeColor({ ...alice, name }, 0), COLORS[1]);
  for (const name of ["Bob (R)", "Bob ( r )", "Republican", "Republican Party", "REPUBLICANS"])
    assert.equal(getOutcomeColor({ ...bob, name }, 0), COLORS[3]);
});

test("manual colors override automatic party colors", () => {
  assert.equal(getOutcomeColor({ ...alice, name: "Alice (D)" }, 0, { "alice-token": "green" }), COLORS[0]);
  assert.equal(getOutcomeColor({ ...bob, name: "Republican" }, 0, { "bob-token": "purple" }), COLORS[4]);
});

test("one choice per party uses party colors", () => {
  const outcomes = [{ ...alice, name: "Alice (D)" }, { ...bob, name: "Bob (R)" }];
  assert.deepEqual(getOutcomeColors(outcomes), [COLORS[1], COLORS[3]]);
});

test("multiple choices for either party keep the whole market's regular palette", () => {
  for (const names of [
    ["Democrat 0-5%", "Democratic 5-10%", "Republican wins"],
    ["Alice (D)", "Bob (R)", "Charlie (R)"],
  ]) {
    const outcomes = names.map((name, i) => ({ ...alice, name, tokenId: String(i) }));
    assert.deepEqual(getOutcomeColors(outcomes), COLORS.slice(0, 3));
    assert.deepEqual(getOutcomeColors(outcomes, { "0": "purple" }), [COLORS[4], COLORS[1], COLORS[2]]);
  }
});

test("hidden choices still prevent party colors on a visible margin bucket", () => {
  const outcome = { ...alice, name: "Democrat 10-15%" };
  const allNames = [outcome.name, "Democrat 15-20%", "Republican wins"];
  assert.deepEqual(getOutcomeColors([outcome], undefined, allNames), [COLORS[0]]);
});

test("unrelated names, partial words, and ambiguous party labels retain palette defaults", () => {
  for (const name of ["Roger", "Richard Democratson", "Democrat or Republican", "Alice (D) / Bob (R)", "Yes", "No"])
    assert.equal(getOutcomeColor({ ...alice, name }, 0), COLORS[0]);
});

test("assignments follow tokens through reordering, renaming, and filtering", () => {
  const overrides = { "alice-token": "red", "bob-token": "blue" } as const;
  assert.deepEqual(getOutcomeColors([alice, bob], overrides), [COLORS[3], COLORS[1]]);
  assert.deepEqual(getOutcomeColors([bob, alice], overrides), [COLORS[1], COLORS[3]]);
  assert.deepEqual(getOutcomeColors([{ ...alice, name: "Updated name" }], overrides), [COLORS[3]]);
  assert.deepEqual(getOutcomeColors([bob], overrides), [COLORS[1]]);
});

test("overriding one outcome leaves other outcomes at their default", () => {
  assert.deepEqual(getOutcomeColors([alice, bob], { "alice-token": "red" }), [COLORS[3], COLORS[1]]);
});

test("Yes and No are configured independently", () => {
  const yes = { ...alice, name: "Yes", tokenId: "yes" };
  const no = { ...bob, name: "No", tokenId: "no" };
  assert.deepEqual(getOutcomeColors([yes, no], { yes: "blue", no: "red" }), [COLORS[1], COLORS[3]]);
  assert.equal(getOutcomeColor(yes, 0, { no: "red" }), COLORS[0]);
});

test("only supported color IDs are loaded from saved data", () => {
  assert.deepEqual(sanitizeOutcomeColors({ "alice-token": "red", "bob-token": "url(invalid)", "": "blue", other: null }), { "alice-token": "red" });
  for (const value of [null, undefined, [], "red", 1]) assert.deepEqual(sanitizeOutcomeColors(value), {});
});

test("local assignments are scoped to user and market; an empty map persists a reset", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  try {
    assert.equal(saveLocalOutcomeColors("user-a", "market-a", { "alice-token": "red" }), true);
    assert.equal(saveLocalOutcomeColors("user-b", "market-a", { "alice-token": "blue" }), true);
    assert.deepEqual(loadLocalOutcomeColors("user-a", "market-a"), { "alice-token": "red" });
    assert.deepEqual(loadLocalOutcomeColors("user-b", "market-a"), { "alice-token": "blue" });
    assert.equal(loadLocalOutcomeColors("user-a", "market-b"), null);
    assert.equal(saveLocalOutcomeColors("user-a", "market-a", {}), true);
    assert.deepEqual(loadLocalOutcomeColors("user-a", "market-a"), {});
    clearLocalOutcomeColors("user-a", "market-a");
    assert.equal(loadLocalOutcomeColors("user-a", "market-a"), null);
    assert.deepEqual(loadLocalOutcomeColors("user-b", "market-a"), { "alice-token": "blue" });
    for (const invalid of ["bad json", "null", "[]"]) {
      data.set("situation-outcome-colors:user-a:market-a", invalid);
      assert.equal(loadLocalOutcomeColors("user-a", "market-a"), null);
    }
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
