import assert from "node:assert/strict";
import { test } from "node:test";
import { HOLD_PREVIEW_DELAY_MS, movedBeforeHold } from "./holdPreview";

test("a short hold activates before the native long-press menu", () => {
  assert.equal(HOLD_PREVIEW_DELAY_MS, 300);
});

test("minor finger movement does not cancel a hold, but swipes do", () => {
  assert.equal(movedBeforeHold(100, 100, 100, 100), false);
  assert.equal(movedBeforeHold(100, 100, 106, 108), false);
  assert.equal(movedBeforeHold(100, 100, 111, 100), true);
  assert.equal(movedBeforeHold(100, 100, 100, 111), true);
  assert.equal(movedBeforeHold(100, 100, 40, 100), true);
});
