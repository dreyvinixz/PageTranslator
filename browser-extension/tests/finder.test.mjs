import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..");
const context = {};
context.globalThis = context;
vm.runInNewContext(readFileSync(join(root, "finder-core.js"), "utf8"), context);
const { findLightRegions, dedupe, overlapArea } = context.PageTranslatorFinderCore;

function fixture(width = 160, height = 120) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 15; data[i + 1] = 35; data[i + 2] = 48; data[i + 3] = 255;
  }
  function paint(x0, y0, x1, y1, r, g, b) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
  }
  return { image: { width, height, data }, paint };
}
test("generic DOM rectangle deduplication keeps independent images", () => {
  const sample = [
    { kind: "image", rect: { x: 2, y: 2, width: 300, height: 200 } },
    { kind: "image", rect: { x: 3, y: 4, width: 296, height: 193 } },
    { kind: "canvas", rect: { x: 400, y: 20, width: 100, height: 100 } }
  ];
  const output = dedupe(sample);
  assert.equal(output.length, 2);
  assert.equal(overlapArea(output[0].rect, output[1].rect), 0);
});

test("comic mode marks a bright bubble with dark lettering as candidate", () => {
  const { image, paint } = fixture();
  paint(20, 20, 92, 57, 245, 245, 240);
  paint(35, 29, 72, 33, 12, 16, 18);
  paint(31, 39, 73, 43, 12, 16, 18);
  const candidates = findLightRegions(image,
    [{ x: 0, y: 0, width: 140, height: 90 }]);
  assert.ok(candidates.length >= 1, "expected a probable balloon");
  const b = candidates[0];
  assert.equal(b.kind, "balloon-candidate");
  assert.equal(b.rect.x, 20);
  assert.equal(b.rect.y, 20);
  assert.ok(b.score > 0 && b.score < 1);
});

test("does not present textless white empty box as a balloon", () => {
  const { image, paint } = fixture();
  paint(20, 20, 90, 55, 250, 250, 250);
  assert.equal(findLightRegions(image, [{ x: 0, y: 0, width: 150, height: 100 }]).length, 0);
});

test("does not scan regions outside comic image candidates", () => {
  const { image, paint } = fixture();
  paint(100, 50, 149, 89, 245, 245, 245);
  paint(110, 65, 129, 69, 20, 20, 20);
  assert.equal(findLightRegions(image, [{ x: 0, y: 0, width: 80, height: 80 }]).length, 0);
});

test("rejects malicious, enormous or empty input, and caps findings", () => {
  const output = findLightRegions({
    width: 10000, height: 10000, data: new Uint8ClampedArray(8)
  }, [{ x: 0, y: 0, width: 100, height: 100 }]);
  assert.equal(output.length, 0);
  assert.equal(findLightRegions(null, []).length, 0);
  assert.equal(dedupe(Array.from({ length: 50 }, (_, i) => ({
    rect: { x: i * 30, y: 0, width: 20, height: 20 }
  })), 10).length, 10);
});

test("Finder preview avoids OCR and remote translation", () => {
  const background = readFileSync(join(root, "background.js"), "utf8");
  const content = readFileSync(join(root, "finder-content.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.match(background, /PT_FINDER_CAPTURE/);
  assert.match(content, /Selecionar imagem \(manual\)/);
  assert.match(content, /Identificar imagens \(Finder\)/);
  assert.match(content, /Genérico/);
  assert.match(content, /Quadrinhos/);
  assert.doesNotMatch(background + content, /Tesseract|PT_RECOGNIZE|PT_TRANSLATE_REMOTE|mymemory/i);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting"]);
});
