import assert from "node:assert/strict";
import { test } from "node:test";
import { createVisiblePolling, subscribeToVisiblePolling } from "./visiblePolling";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture() {
  let hidden = false;
  let visibility: (() => void) | undefined;
  let id = 0;
  const timers = new Map<number, () => void>();
  const subscribe = createVisiblePolling({
    hidden: () => hidden,
    listen: (callback) => { visibility = callback; return () => { visibility = undefined; }; },
    interval: (callback) => { timers.set(++id, callback); return id as unknown as ReturnType<typeof setInterval>; },
    clear: (timer) => { timers.delete(timer as unknown as number); },
  });
  return { subscribe, timers, tick: async () => { for (const run of timers.values()) run(); await settle(); },
    hide: () => { hidden = true; visibility?.(); }, show: () => { hidden = false; visibility?.(); } };
}

test("all cards share one refresh timer and hidden tabs pause until immediate resume", async () => {
  const f = fixture();
  let calls = 0;
  const stops = Array.from({ length: 28 }, () => f.subscribe(() => { calls++; }, 12_000));
  assert.equal(f.timers.size, 1);
  await f.tick();
  assert.equal(calls, 28);
  f.hide();
  assert.equal(f.timers.size, 0);
  await f.tick();
  assert.equal(calls, 28);
  f.show();
  await settle();
  assert.equal(calls, 56);
  stops.forEach((stop) => stop());
  assert.equal(f.timers.size, 0);
});

test("slow refreshes do not overlap and one failure cannot stop other cards", async () => {
  const f = fixture();
  let finish!: () => void;
  let calls = 0;
  f.subscribe(() => { calls++; return new Promise<void>((resolve) => { finish = resolve; }); }, 12_000);
  let other = 0;
  f.subscribe(() => { other++; throw new Error("offline"); }, 12_000);
  await f.tick();
  await f.tick();
  assert.equal(calls, 1);
  assert.equal(other, 2);
  finish();
  await settle();
  await f.tick();
  assert.equal(calls, 2);
});

test("unsubscribed or newly hidden cards do not run queued callbacks", async () => {
  const f = fixture();
  let calls = 0;
  const stop = f.subscribe(() => { calls++; }, 12_000);
  for (const run of f.timers.values()) run();
  stop();
  await settle();
  assert.equal(calls, 0);
  f.hide();
  f.subscribe(() => { calls++; }, 12_000);
  assert.equal(f.timers.size, 0);
});

test("browser timer methods keep their Window receiver during hide and cleanup", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  const listeners = new Set<() => void>();
  const document = {
    hidden: false,
    addEventListener: (_event: string, callback: () => void) => { listeners.add(callback); },
    removeEventListener: (_event: string, callback: () => void) => { listeners.delete(callback); },
  };
  let cleared = 0;
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    globalThis.setInterval = (() => 1) as unknown as typeof setInterval;
    globalThis.clearInterval = function (this: unknown) {
      assert.ok(this === globalThis, "Native timer methods require the Window receiver");
      cleared++;
    } as typeof clearInterval;
    const stop = subscribeToVisiblePolling(() => {}, 12_000);
    document.hidden = true;
    listeners.forEach((listener) => listener());
    document.hidden = false;
    listeners.forEach((listener) => listener());
    await settle();
    stop();
    assert.equal(cleared, 2);
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
