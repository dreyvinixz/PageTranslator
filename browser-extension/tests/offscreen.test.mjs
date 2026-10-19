import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const dirname = join(import.meta.dirname, "..");
function makeHarness() {
  let listener, canvasSize, drawCount = 0;
  const worker = { recognize: async (canvas) => {
    canvasSize = [canvas.width, canvas.height];
    return { data: { blocks: [{ paragraphs: [{ lines: [{
      text: "BRUCE IS HERE", confidence: 92,
      bbox: { x0: 20, y0: 40, x1: 200, y1: 64 }
    }] }] }] } };
  }};
  class FakeImage {
    naturalWidth = 1600;
    naturalHeight = 1000;
    src = "";
    async decode() {}
  }
  const ctx = {
    fillStyle: "",
    fillRect() {},
    drawImage() { drawCount++; }
  };
  const sandbox = {
    chrome: { runtime: {
      getURL: (path) => path,
      onMessage: { addListener: (callback) => { listener = callback; } }
    }},
    Tesseract: { createWorker: async () => worker },
    Image: FakeImage,
    document: { createElement: () => ({
      width: 0, height: 0,
      getContext: () => ctx
    }) },
    performance: { now: () => 100 },
    PageTranslatorRegions: null
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(dirname, "regions.js"), "utf8"), sandbox);
  vm.runInNewContext(readFileSync(join(dirname, "offscreen.js"), "utf8"), sandbox);
  return {
    query: (args) => new Promise((resolve) => listener({
      type: "PT_RECOGNIZE_VIEW", target: "offscreen", screenshot: "data:image/jpeg;base64,AAAA",
      viewport: { width: 1600, height: 1000 }, ...args
    }, {}, resolve)),
    queryManual: (rect, screenshot = "data:image/jpeg;base64,AAAA") =>
      new Promise((resolve) => listener({ type: "PT_RECOGNIZE", target: "offscreen", screenshot, rect }, {}, resolve)),
    measurements: () => ({ canvasSize, drawCount })
  };
}
test("cropping the comic ROI preserves global viewport coordinates", { timeout: 5000 }, async () => {
  const harness = makeHarness();
  const output = await harness.query({
    imageRegions: [{ x: 300, y: 250, width: 600, height: 450 }]
  });
  assert.equal(output.ok, true);
  assert.deepEqual(Array.from(output.regions, (r) => r.bbox.x0), [320]);
  assert.deepEqual(Array.from(output.regions, (r) => r.bbox.y0), [290]);
  assert.deepEqual(harness.measurements().canvasSize, [600, 450]);
  assert.equal(harness.measurements().drawCount, 1);
});
test("rejects screenshot data without a valid image MIME type", { timeout: 5000 }, async () => {
  const harness = makeHarness();
  const result = await harness.query({
    imageRegions: [{ x: 300, y: 250, width: 600, height: 450 }],
    screenshot: "data:text/html;base64,AAAA"
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Captura inválida/);
});
test("v0.2.2 keeps failure mode user-retryable, not endless re-scans", () => {
  const code = readFileSync(join(dirname, "auto-content.js"), "utf8");
  assert.match(code, /scanBlocked = true/);
  assert.match(code, /Clique Atualizar para tentar novamente/);
  assert.match(code, /needsRescan = true/);
  assert.doesNotMatch(code, /observer\.observe\(/);
});

test("manual selection analyzes only the chosen balloon and accepts JPEG", async () => {
  const harness = makeHarness();
  const result = await harness.queryManual({
    x: 180, y: 310, width: 220, height: 90,
    viewportWidth: 1600, viewportHeight: 1000
  });
  assert.equal(result.ok, true);
  assert.equal(result.text, "");
  const [width, height] = harness.measurements().canvasSize;
  assert.ok(width <= 1200 && height <= 1200);
  assert.ok(width * height <= 1200000);
  assert.equal(harness.measurements().drawCount, 1);
});
test("manual selection rejects unsupported screenshot MIME", async () => {
  const harness = makeHarness();
  const result = await harness.queryManual({
    x: 180, y: 310, width: 220, height: 90,
    viewportWidth: 1600, viewportHeight: 1000
  }, "data:text/plain;base64,AAAA");
  assert.equal(result.ok, false);
  assert.match(result.error, /Formato da captura inválido/);
});
test("entrypoint is manual-first and never starts full-screen OCR on icon click", () => {
  const background = readFileSync(join(dirname, "background.js"), "utf8");
  assert.match(background, /files: \["content\.js"\]/);
  assert.match(background, /type: "PT_OPEN"/);
  assert.match(background, /PT_MANUAL_REQUEST/);
  assert.match(background, /PT_AUTO_REQUEST/);
  assert.match(background, /45000, "Reconhecimento do balão"/);
  const ui = readFileSync(join(dirname, "content.js"), "utf8");
  assert.match(ui, /PT_MANUAL_CAPTURED/);
  assert.match(ui, /Selecionar balão/);
  assert.match(ui, /Automático \(experimental\)/);
  assert.match(ui, /showTranslationBox/);
});
