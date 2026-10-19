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
