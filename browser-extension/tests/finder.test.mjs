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
const { findTextCandidates, groupRows } = context.PageTranslatorTextCandidates;
const { markMixedInkRegions } = context.PageTranslatorFinderCore;
vm.runInNewContext(readFileSync(join(root, "finder-fit.js"), "utf8"), context);
const { refineSpeechRegions } = context.PageTranslatorBalloonFit;

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

test("connected graphic balloons with two separate utterances remain separate", () => {
  // Screenshot-derived geometry (synthetic metadata only, no comic artwork).
  const rows = [
    { x: 103, y: 288, x2: 123, y2: 295, count: 3 },
    { x: 85, y: 296, x2: 138, y2: 304, count: 4 },
    { x: 138, y: 314, x2: 182, y2: 321, count: 5 },
    { x: 126, y: 323, x2: 191, y2: 330, count: 7 },
    { x: 135, y: 332, x2: 174, y2: 339, count: 3 }
  ];
  const separate = Array.from(groupRows(rows));
  assert.equal(separate.length, 2);
  assert.deepEqual(separate.map((x) => x.lineCount), [2, 3]);
  assert.equal(separate[0].y2, 304);
  assert.equal(separate[1].y, 314);
});

test("line bounding geometry cannot bridge speech content from neighboring bubbles", () => {
  const rows = [
    { x: 50, y: 15, x2: 160, y2: 22, count: 9 },
    { x: 60, y: 25, x2: 145, y2: 32, count: 8 },
    { x: 122, y: 35, x2: 215, y2: 42, count: 9 }, // low overlap with previous line
    { x: 130, y: 45, x2: 205, y2: 52, count: 7 }
  ];
  const separate = Array.from(groupRows(rows));
  assert.equal(separate.length, 2);
  assert.deepEqual(separate.map((x) => x.lineCount), [2, 2]);
});

test("overlapping display borders are allowed if text ink does not collide", () => {
  const regions = [
    { rect:{x:12,y:18,width:100,height:65}, inkRect:{x:24,y:28,width:74,height:19} },
    { rect:{x:60,y:63,width:120,height:71}, inkRect:{x:75,y:82,width:85,height:36} }
  ];
  const marked = Array.from(markMixedInkRegions(regions));
  assert.equal(marked.length, 2);
  assert.equal(marked[0].risk, false);
  assert.equal(marked[1].risk, false);
});

test("overlapping ink triggers a review flag instead of merging two candidates", () => {
  const regions = [
    { rect:{x:20,y:20,width:120,height:70}, inkRect:{x:38,y:31,width:75,height:42} },
    { rect:{x:55,y:38,width:100,height:80}, inkRect:{x:70,y:51,width:65,height:43} }
  ];
  const marked = Array.from(markMixedInkRegions(regions));
  assert.equal(marked.length, 2);
  assert.equal(marked[0].risk, true);
  assert.equal(marked[1].risk, true);
});

test("large crop that swallows another independent utterance is marked unsafe", () => {
  const regions = [
    { rect:{x:10,y:10,width:180,height:180}, inkRect:{x:25,y:27,width:65,height:22} },
    { rect:{x:116,y:110,width:90,height:65}, inkRect:{x:125,y:124,width:59,height:20} }
  ];
  const marked = Array.from(markMixedInkRegions(regions));
  assert.equal(marked.length, 2);
  assert.equal(marked[0].risk, true, "large crop includes another text group");
  assert.equal(marked[1].risk, false, "smaller crop contains only its own text");
});

test("Finder counts text regions independently from image elements", () => {
  const ui = readFileSync(join(root, "finder-content.js"), "utf8");
  assert.match(ui, /\["balloon-candidate", "text-region-candidate"\]\.includes\(c\.kind\)/);
  assert.match(ui, /markMixedInkRegions\(mapped\)/);
  assert.match(ui, /PageTranslator · Finder 0\.4\.0/);
});

test("balloon fitter expands tightly cropped text to bright speech background", () => {
  const { image, paint } = fixture(240, 160);
  paint(25, 20, 160, 111, 241, 241, 235);
  // Text-sized dark strokes leave plenty of light support around ink.
  for (let i = 0; i < 8; i++) paint(70 + i*8, 60, 73 + i*8, 67, 15, 15, 15);
  const region = {
    kind: "text-region-candidate",
    rect: { x: 66, y: 52, width: 72, height: 26 },
    inkRect: { x: 70, y: 57, width: 64, height: 15 }
  };
  const result = refineSpeechRegions(image, [region]);
  assert.equal(result.length, 1);
  assert.ok(result[0].rect.x <= 33, "should find left balloon margin");
  assert.ok(result[0].rect.y <= 26, "should find upper balloon margin");
  assert.ok(result[0].rect.width >= 100, "wider than text, includes surrounding balloon");
  assert.equal(result[0].fit, "balloon-margin");
});

test("balloon fitting never covers ink assigned to another utterance", () => {
  const { image, paint } = fixture(280, 200);
  paint(20, 20, 240, 175, 242, 242, 238);
  const two = [
    {
      rect: {x: 60, y: 36, width: 75, height: 75},
      inkRect: {x: 70, y: 50, width: 55, height: 17}
    },
    {
      rect: {x: 120, y: 92, width: 80, height: 45},
      inkRect: {x: 135, y: 108, width: 52, height: 15}
    }
  ];
  const result = refineSpeechRegions(image, two);
  const foreign = result[1].inkRect;
  const overlap = context.PageTranslatorBalloonFit.intersection(result[0].rect, foreign);
  assert.equal(overlap, 0);
  assert.ok(result[0].rect.width > 0);
});

test("unframed dark balloons do not expand into unrelated illustrations", () => {
  const { image } = fixture(220, 120);
  const text = { rect: {x: 43,y: 39,width: 75,height: 27},
    inkRect: {x: 50,y: 44,width: 63,height: 17} };
  const result = refineSpeechRegions(image, [text]);
  assert.equal(result[0].fit, "text-only");
  assert.deepEqual({...result[0].rect}, text.rect);
});

test("frame fitting reports unsafe original crop rather than losing own text", () => {
  const { image, paint } = fixture(240, 160);
  paint(15, 15, 210, 145, 246, 245, 244);
  const a = {rect:{x:20,y:20,width:135,height:100},
    inkRect:{x:45,y:40,width:50,height:20}};
  const b = {rect:{x:93,y:45,width:90,height:85},
    inkRect:{x:95,y:49,width:50,height:25}};
  const result = refineSpeechRegions(image, [a,b]);
  assert.equal(result.length, 2);
  assert.ok(["review","text-only","balloon-margin"].includes(result[0].fit));
  // Even with ambiguous speech ownership the function never fuses candidates.
  assert.ok(result[0].inkRect.width === a.inkRect.width);
  assert.ok(result[1].inkRect.width === b.inkRect.width);
});

test("caption fitter crosses a thin dark frame to reach its light outer margin", () => {
  const { image, paint } = fixture(240, 150);
  paint(32, 24, 193, 115, 246, 246, 242);
  // A short horizontal black outline inside the search path.
  paint(45, 42, 178, 45, 30, 30, 30);
  for (let i = 0; i < 10; i++) paint(50 + i*11, 66, 55 + i*11, 75, 24, 24, 24);
  const region = {
    rect: { x: 42, y: 61, width: 150, height: 31 },
    inkRect: { x: 49, y: 65, width: 127, height: 20 }
  };
  const found = refineSpeechRegions(image, [region])[0];
  assert.ok(found.rect.y <= 31, "must find outer margin above a short black border");
  assert.ok(found.rect.width >= region.rect.width);
  assert.equal(found.fitRisk, false);
});
