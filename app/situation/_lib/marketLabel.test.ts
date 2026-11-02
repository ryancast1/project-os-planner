import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMarketLabel } from "./marketLabel";

test("custom labels are trimmed and take precedence over the Polymarket title", () => {
  assert.equal(resolveMarketLabel("  TX Senate  ", "Texas Senate Election Winner"), "TX Senate");
  assert.equal(resolveMarketLabel("House", null), "House");
});

test("clearing a label restores the original title, not the previous custom label", () => {
  assert.equal(resolveMarketLabel("", "Texas Senate Election Winner"), "Texas Senate Election Winner");
  assert.equal(resolveMarketLabel("  \n ", "  Original title  "), "Original title");
});

test("a missing default title cannot produce a blank saved label", () => {
  assert.equal(resolveMarketLabel("", null), null);
  assert.equal(resolveMarketLabel("", undefined), null);
  assert.equal(resolveMarketLabel(" ", "  "), null);
});
