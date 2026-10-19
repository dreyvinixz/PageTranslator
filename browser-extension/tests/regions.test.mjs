import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const context = {};
context.globalThis = context;
vm.runInNewContext(readFileSync(join(import.meta.dirname, "..", "regions.js"), "utf8"), context);
const { collectLines, groupLines } = context.PageTranslatorRegions;

const line = (text, x0, y0, x1, y1, confidence = 91) => ({
  text, bbox: { x0, y0, x1, y1 }, confidence
});

test("Tesseract v6 blocks -> normalized viewport lines", () => {
  const blocks = [{ paragraphs: [{ lines: [
    line("  I can't  ", 100, 50, 270, 75),
    line("Do it!", 100, 90, 220, 110, 12),
    line("Better now", 120, 95, 310, 120)
  ] }] }];
  const result = collectLines(blocks, 0.5, 0.5, 200, 200);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "I can't");
  assert.equal(result[0].bbox.x0, 50);
  assert.equal(result[1].bbox.x1, 155);
});

test("groups consecutive lines from the same balloon", () => {
  const input = [
    line("I CAN'T TELL YOU", 50, 100, 240, 122),
    line("EVERYTHING HERE", 60, 132, 250, 154),
    line("SOMEONE IS WATCHING", 40, 164, 260, 186)
  ];
  const result = groupLines(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].lineCount, 3);
  assert.equal(result[0].text, "I CAN'T TELL YOU EVERYTHING HERE SOMEONE IS WATCHING");
  assert.equal(result[0].bbox.y1, 186);
});

test("keeps two balloon columns apart", () => {
  const input = [
    line("HELLO", 20, 20, 160, 44),
    line("THE CITY", 420, 20, 560, 44),
    line("BRUCE", 30, 52, 155, 76),
    line("IS SAFE", 425, 52, 560, 76)
  ];
  const result = groupLines(input);
  assert.equal(result.length, 2);
  assert.deepEqual(Array.from(result, (x) => x.lineCount).sort(), [2, 2]);
});

test("distant lines are not grouped even when horizontally aligned", () => {
  const input = [
    line("FIRST BALLOON", 30, 20, 180, 42),
    line("SECOND BALLOON", 30, 200, 180, 222)
  ];
  assert.equal(groupLines(input).length, 2);
});

test("rejects low confidence and invalid bounding boxes", () => {
  const input = [{ paragraphs: [{ lines: [
    line("COOL", 20, 20, 60, 50, 4),
    line("OKAY", 20, 80, 60, 50, 99),
    line("HI THERE", 20, 70, 150, 95, 80)
  ] }] }];
  const lines = collectLines(input, 1, 1, 500, 500);
  assert.equal(lines.length, 1);
  assert.equal(groupLines(lines).length, 1);
});

test("limits the number of rendered regions", () => {
  const input = Array.from({ length: 30 }, (_, i) =>
    line("HELLO THERE", i * 30, i * 100, i * 30 + 100, i * 100 + 20));
  assert.equal(groupLines(input, 7).length, 7);
});

test("ignores non-English or empty OCR noise", () => {
  const lines = collectLines([{ paragraphs: [{ lines: [
    line("。", 10, 10, 30, 25),
    line("   ", 40, 30, 70, 45)
  ] }] }], 1, 1, 800, 600);
  assert.equal(lines.length, 0);
});
