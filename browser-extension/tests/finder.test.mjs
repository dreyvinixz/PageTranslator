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
vm.runInNewContext(readFileSync(join(root, "finder-text.js"), "utf8"), context);
const { findTextCandidates } = context.PageTranslatorTextCandidates;

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
  assert.equal(b.shape, "rectangular");
  assert.equal(b.rect.x, 20);
  assert.equal(b.rect.y, 20);
  assert.ok(b.score > 0 && b.score < 1);
});

test("rounded bright balloon is reported as shape candidate, without text recognition", () => {
  const { image, paint } = fixture(200, 140);
  const cx = 85, cy = 60, rx = 58, ry = 27;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) paint(x, y, x + 1, y + 1, 242, 242, 237);
  }
  paint(60, 49, 105, 53, 15, 15, 15);
  paint(67, 62, 106, 66, 15, 15, 15);
  const regions = findLightRegions(image, [{ x: 0, y: 0, width: 170, height: 120 }]);
  assert.ok(regions.length > 0);
  assert.equal(regions[0].shape, "rounded");
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

test("letter strokes on a bright caption yield one text-bearing region", () => {
  const { image, paint } = fixture(250, 150);
  paint(32, 24, 150, 84, 238, 244, 241);
  for (let i = 0; i < 10; i++) paint(43 + i * 9, 43, 47 + i * 9, 51, 35, 35, 35);
  const candidates = findTextCandidates(image, [{ x: 20, y: 10, width: 170, height: 110 }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "text-region-candidate");
  assert.ok(candidates[0].characters >= 6);
});

test("text detector rejects a blank bright window with grilles", () => {
  const { image, paint } = fixture(250, 150);
  paint(20, 18, 180, 120, 219, 233, 221);
  for (let x = 55; x < 160; x += 42) paint(x, 18, x + 5, 120, 36, 49, 39);
  const candidates = findTextCandidates(image, [{ x: 10, y: 10, width: 190, height: 120 }]);
  assert.equal(candidates.length, 0);
});

test("text detector produces separate candidates for distant balloons", () => {
  const { image, paint } = fixture(260, 170);
  paint(20, 20, 115, 62, 245, 245, 242);
  paint(134, 101, 245, 147, 235, 244, 239);
  for (let i = 0; i < 8; i++) {
    paint(28 + i * 9, 34, 32 + i * 9, 42, 22, 30, 33);
    paint(142 + i * 10, 117, 146 + i * 10, 125, 19, 28, 29);
  }
  const candidates = findTextCandidates(image, [{ x: 0, y: 0, width: 260, height: 170 }]);
  assert.equal(candidates.length, 2);
});
