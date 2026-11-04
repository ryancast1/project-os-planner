import assert from "node:assert/strict";
import { test } from "node:test";
import { getVisiblePolymarketOutcomes } from "./outcomes";
import type { Outcome } from "./types";

function outcome(name: string, currentPrice: number): Outcome {
  return { name, tokenId: name, currentPrice, history: [] };
}

const marginChoices = [
  outcome("Democrat 15-20%", 0.4),
  outcome("Democrat 10-15%", 0.26),
  outcome("Democrat 5-10%", 0.13),
  outcome("Democrat 20-25%", 0.1),
  outcome("Democrat 0-5%", 0.05),
  outcome("Republican Wins", 0.03),
];

test("margin markets show four qualifying choices in natural alphabetical order", () => {
  const original = structuredClone(marginChoices);
  for (const compact of [true, false]) {
    const visible = getVisiblePolymarketOutcomes(marginChoices, compact, { title: "New York Governor - Margin" });
    assert.deepEqual(visible.map((choice) => choice.name), ["Democrat 5-10%", "Democrat 10-15%", "Democrat 15-20%", "Democrat 20-25%"]);
  }
  assert.deepEqual(marginChoices, original);
});

test("the four strongest qualifying choices are selected before sorting their names", () => {
  const choices = [outcome("A", 0.1), outcome("B", 0.2), outcome("C", 0.5), outcome("D", 0.3), outcome("E", 0.4)];
  assert.deepEqual(getVisiblePolymarketOutcomes(choices, true, { title: "Election Margin" }).map((choice) => choice.name), ["B", "C", "D", "E"]);
});

test("10% is included but lower and invalid prices are excluded", () => {
  const choices = [outcome("Z", 0.0999), outcome("B", 0.1), outcome("C", 0.2), outcome("Invalid", NaN), outcome("Too high", 1.1)];
  assert.deepEqual(getVisiblePolymarketOutcomes(choices, true, { title: "MARGIN of victory" }).map((choice) => choice.name), ["B", "C"]);
});

test("natural alphabetical order includes party words rather than price order", () => {
  const choices = [outcome("Democrat 10-15%", 0.5), outcome("Republican Wins", 0.1), outcome("Democrat 5-10%", 0.2)];
  assert.deepEqual(getVisiblePolymarketOutcomes(choices, true, { title: "Election Margin" }).map((choice) => choice.name), ["Democrat 5-10%", "Democrat 10-15%", "Republican Wins"]);
});

test("saved labels can identify margin markets even when the upstream title differs", () => {
  assert.equal(getVisiblePolymarketOutcomes(marginChoices, true, { title: "Governor Election", label: "Governor - Margin" }).length, 4);
  assert.equal(getVisiblePolymarketOutcomes(marginChoices, true, { title: "Governor Election Margin", label: "Governor" }).length, 4);
});

test("the complete outcome count includes choices hidden by upstream low-price filtering", () => {
  const choices = [outcome("Democrat 15-20%", 0.5), outcome("Republican Wins", 0.06)];
  assert.equal(getVisiblePolymarketOutcomes(choices, true, { title: "Margin", outcomeNames: [...choices.map((choice) => choice.name), "Democrat 0-5%"] }).length, 1);
});

test("two-outcome margin markets and non-margin markets retain existing behavior", () => {
  const binary = [outcome("Yes", 0.94), outcome("No", 0.06)];
  assert.deepEqual(getVisiblePolymarketOutcomes(binary, true, { title: "Margin above 10?" }), binary);
  assert.equal(getVisiblePolymarketOutcomes(marginChoices, true, { title: "Governor Winner" }).length, 5);
  assert.deepEqual(getVisiblePolymarketOutcomes(marginChoices, false, { title: "Governor Winner" }), marginChoices.slice(0, 4));
});

test("margin markets retain a strongest-choice fallback if nothing reaches the threshold", () => {
  const choices = [outcome("A", 0.05), outcome("B", 0.09), outcome("C", 0.08)];
  assert.deepEqual(getVisiblePolymarketOutcomes(choices, true, { title: "Election Margin" }), [choices[1]]);
});

test("named two-choice races keep both chart lines below 5%, including 100/0", () => {
  for (const price of [0.049, 0.001, 0]) {
    const choices = [outcome("Alice", 1 - price), outcome("Bob", price)];
    for (const compact of [true, false]) {
      assert.deepEqual(getVisiblePolymarketOutcomes(choices, compact, { outcomeNames: ["Alice", "Bob"] }), choices);
    }
  }
});

test("a larger field reduced to two visible choices retains the 5% floor", () => {
  const choices = [outcome("Alice", 0.96), outcome("Bob", 0.04)];
  assert.deepEqual(getVisiblePolymarketOutcomes(choices, true, { outcomeNames: ["Alice", "Bob", "Carol"] }), [choices[0]]);
  assert.deepEqual(getVisiblePolymarketOutcomes([...choices, outcome("Carol", 0)], true), [choices[0]]);
});

test("the two-choice exception leaves Yes/No filtering and invalid-price handling unchanged", () => {
  const binary = [outcome(" Yes ", 0.99), outcome("NO", 0.01)];
  assert.deepEqual(getVisiblePolymarketOutcomes(binary, true), [binary[0]]);
  const invalid = [outcome("Alice", 0.99), outcome("Bob", NaN)];
  assert.deepEqual(getVisiblePolymarketOutcomes(invalid, true), [invalid[0]]);
});
