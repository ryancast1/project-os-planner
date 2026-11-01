import assert from "node:assert/strict";
import { test } from "node:test";
import { getTimeLabelLimit, selectAxisLabels } from "./chartLayout";

test("sparse axis labels retain both endpoints without crowding the last pair", () => {
  assert.deepEqual(selectAxisLabels([0, 1, 2, 3, 4, 5, 6], 5), [0, 2, 4, 6]);
  assert.deepEqual(selectAxisLabels([0, 1, 2, 3, 4, 5, 6, 7], 5), [0, 2, 4, 7]);
  assert.deepEqual(selectAxisLabels([0, 1, 2, 3, 4, 5, 6], 2), [0, 6]);
});

test("single-label and empty axes are safe, and roomy axes keep all labels", () => {
  assert.deepEqual(selectAxisLabels([], 2), []);
  assert.deepEqual(selectAxisLabels([1], 2), [1]);
  assert.deepEqual(selectAxisLabels([1, 2, 3], 1), [3]);
  assert.deepEqual(selectAxisLabels([1, 2, 3], 0), [3]);
  assert.deepEqual(selectAxisLabels([1, 2, 3], 7), [1, 2, 3]);
});

test("time label density responds to chart width and text size, with at most two labels in 7x4", () => {
  const labels = [{ label: "11:30 AM" }, { label: "12:30 PM" }];
  assert.equal(getTimeLabelLimit(1000, 10, labels, false), 7);
  assert.equal(getTimeLabelLimit(1000, 10, labels, true), 2);
  assert.ok(getTimeLabelLimit(180, 10, labels, false) < getTimeLabelLimit(350, 10, labels, false));
  assert.ok(getTimeLabelLimit(350, 20, labels, false) < getTimeLabelLimit(350, 10, labels, false));
  assert.equal(getTimeLabelLimit(40, 20, labels, true), 1);
  assert.equal(getTimeLabelLimit(0, 10, labels, false), 2);
});

test("label selection never exceeds its limit or duplicates or reorders a label", () => {
  for (let length = 1; length <= 30; length++) {
    const labels = Array.from({ length }, (_, i) => i);
    for (let limit = 1; limit <= 7; limit++) {
      const selected = selectAxisLabels(labels, limit);
      assert.ok(selected.length <= limit);
      assert.equal(new Set(selected).size, selected.length);
      assert.deepEqual([...selected].sort((a, b) => a - b), selected);
      assert.equal(selected[selected.length - 1], length - 1);
      if (limit > 1) assert.equal(selected[0], 0);
    }
  }
});
