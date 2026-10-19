import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(join(root, "finder-auto.js"), "utf8"), sandbox);
const { createAutoScanner } = sandbox.PageTranslatorAutoScanner;

function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  const clock = {
    now: () => now,
    setTimer: (fn, ms) => { const key = ++id; timers.set(key, { at: now + ms, fn }); return key; },
    clearTimer: (key) => timers.delete(key),
    advance: async (milliseconds) => {
      const target = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, x]) => x.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
    },
    count: () => timers.size
  };
  return clock;
}

test("auto finder does not scan until activation, then detects once", async () => {
  const clock = fakeClock();
  let scans = 0;
  const scanner = createAutoScanner({
    ...clock, scan: async () => { scans++; }, isVisible: () => true
  });
  await clock.advance(3000);
  assert.equal(scans, 0);
  scanner.start();
  await clock.advance(0);
  assert.equal(scans, 1);
  await clock.advance(20000);
  assert.equal(scans, 1, "must never poll while the page is unchanged");
});

test("scroll bursts coalesce, and captures respect a four-second minimum", async () => {
  const clock = fakeClock();
  let scans = 0, invalidations = 0;
  const scanner = createAutoScanner({
    ...clock,
    scan: async () => { scans++; },
    invalidate: () => { invalidations++; },
    isVisible: () => true
  }, { idleMs: 1000, gapMs: 4000 });
  scanner.start();
  await clock.advance(0);
  assert.equal(scans, 1);
  await clock.advance(100);
  scanner.request("scroll");
  await clock.advance(200);
  scanner.request("scroll");
  await clock.advance(1300);
  assert.equal(scans, 1);
  await clock.advance(2400);
  assert.equal(scans, 2);
  assert.equal(invalidations, 2);
});

test("only one screenshot can run at once, with a pending update afterward", async () => {
  const clock = fakeClock();
  let scans = 0, done;
  const blocker = new Promise((resolve) => { done = resolve; });
  const scanner = createAutoScanner({
    ...clock,
    scan: () => { scans++; return scans === 1 ? blocker : Promise.resolve(); },
    isVisible: () => true
  }, { idleMs: 1000, gapMs: 4000 });
  scanner.start();
  await clock.advance(0);
  scanner.request("scroll");
  await clock.advance(5500);
  assert.equal(scans, 1);
  done();
  await Promise.resolve();
  await Promise.resolve();
  await clock.advance(1000);
  assert.equal(scans, 2);
  assert.equal(scanner.busy, false);
});

test("closing or pausing cancels automatic follow-up and avoids capture", async () => {
  const clock = fakeClock();
  let scans = 0;
  const scanner = createAutoScanner({
    ...clock, scan: async () => { scans++; }, isVisible: () => true
  });
  scanner.start();
  await clock.advance(0);
  scanner.request("scroll");
  scanner.stop();
  await clock.advance(6000);
  assert.equal(scans, 1);
  assert.equal(scanner.enabled, false);
  scanner.dispose();
  scanner.start();
  await clock.advance(9000);
  assert.equal(scans, 1);
});

test("background tab pauses queued scans and resumes on visibility", async () => {
  const clock = fakeClock();
  let scans = 0, visible = true;
  const scanner = createAutoScanner({
    ...clock, scan: async () => { scans++; }, isVisible: () => visible
  });
  scanner.start();
  await clock.advance(0);
  visible = false;
  scanner.visibilityChanged();
  scanner.request("scroll");
  await clock.advance(10000);
  assert.equal(scans, 1);
  visible = true;
  scanner.visibilityChanged();
  await clock.advance(500);
  assert.equal(scans, 2);
});

test("a rejected scan disables automatic retries until user refresh", async () => {
  const clock = fakeClock();
  let errors = 0, scans = 0;
  const scanner = createAutoScanner({
    ...clock, isVisible: () => true,
    scan: async () => { scans++; throw Error("capture failed"); },
    onError: () => { errors++; }
  });
  scanner.start();
  await clock.advance(0);
  scanner.request("scroll");
  await clock.advance(20000);
  assert.equal(scans, 1);
  assert.equal(errors, 1);
  assert.equal(scanner.enabled, false);
});

test("UI connects scroll, resize, lazy image loading, manual and pause controls", () => {
  const ui = readFileSync(join(root, "finder-content.js"), "utf8");
  const bg = readFileSync(join(root, "background.js"), "utf8");
  assert.match(ui, /Auto ao rolar: ligado/);
  assert.match(ui, /autoScanner\.request\("scroll", 1000\)/);
  assert.match(ui, /autoScanner\.request\("resize", 1100\)/);
  assert.match(ui, /autoScanner\.request\("image", 1300\)/);
  assert.match(ui, /autoScanner\.stop\(\); \/\/ Manual/);
  assert.match(ui, /autoScanner\.start\(\)/);
  assert.match(bg, /finder-auto\.js/);
  assert.doesNotMatch(ui + bg, /Tesseract|PT_TRANSLATE_REMOTE|PT_RECOGNIZE/);
});
