import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const ctx = {};
ctx.globalThis = ctx;
for (const module of ["finder-association.js", "finder-shortcut.js"]) {
  vm.runInNewContext(readFileSync(join(root, module), "utf8"), ctx);
}
const { associate } = ctx.PageTranslatorAssociation;
const Shortcut = ctx.PageTranslatorShortcut;
const shape = (x, y, w, h, type = "rounded") =>
  ({ shape: type, rect: { x, y, width: w, height: h } });
const text = (x, y, w, h) => ({
  kind: "text-region-candidate", lineCount: 2,
  inkRect: { x, y, width: w, height: h },
  rect: { x: x - 4, y: y - 4, width: w + 8, height: h + 8 }
});
const plain = value => JSON.parse(JSON.stringify(value));

test("two separate balloons each own their own distinct text", () => {
  const result = plain(associate([shape(10, 10, 100, 70), shape(145, 10, 100, 70)],
    [text(33, 33, 50, 14), text(170, 32, 52, 16)]));
  assert.equal(result[0].status, "CANDIDATE");
  assert.equal(result[1].status, "CANDIDATE");
  assert.equal(result[0].balloonId, "shape-1");
  assert.equal(result[1].balloonId, "shape-2");
  assert.deepEqual(result[0].candidateBalloonIds, ["shape-1"]);
  assert.equal(result[0].detectedLanguage, null);
  assert.equal(result[0].translationSupported, null);
});

test("a merged balloon-shaped white area containing two speeches never assigns confidently", () => {
  const result = plain(associate([shape(10, 10, 240, 100)], [
    text(30, 30, 55, 16), text(170, 60, 55, 16)
  ]));
  assert.deepEqual(result.map(x => x.status), ["REVIEW_REQUIRED", "REVIEW_REQUIRED"]);
  assert.equal(result[0].reason, "SHARED_BALLOON_CANDIDATE");
  assert.notEqual(result[0].textGroupId, result[1].textGroupId);
});

test("text fitting two possible balloons is explicitly ambiguous", () => {
  const found = plain(associate([shape(10, 10, 100, 70), shape(30, 10, 100, 70)],
    [text(40, 25, 55, 16)]));
  assert.equal(found[0].balloonId, null);
  assert.equal(found[0].reason, "MULTIPLE_BALLOON_CANDIDATES");
  assert.equal(found[0].status, "REVIEW_REQUIRED");
});

test("text without confirmed balloon remains TEXT_ONLY and cannot be auto-translated", () => {
  const found = plain(associate([], [text(50, 40, 80, 25)]));
  assert.equal(found[0].status, "TEXT_ONLY");
  assert.equal(found[0].balloonId, null);
  assert.equal(found[0].translationSupported, null);
});

test("neighboring text is surfaced without fusing its group", () => {
  const found = plain(associate([], [text(20, 20, 60, 15), text(22, 52, 55, 15)]));
  assert.deepEqual(found[0].nearbyTextGroupIds, ["text-2"]);
  assert.equal(found[0].textGroupId, "text-1");
});

test("overlapping ink is REVIEW_REQUIRED, even without a detected shape", () => {
  const found = plain(associate([], [text(20, 20, 60, 22), text(45, 30, 60, 22)]));
  assert.equal(found[0].reason, "INK_OVERLAP");
  assert.equal(found[1].status, "REVIEW_REQUIRED");
});

test("shortcut records a single function key or a modifier combination", () => {
  const f9 = Shortcut.shortcutFromEvent({ key: "F9", code: "F9" });
  const chord = Shortcut.shortcutFromEvent({
    key: "m", code: "KeyM", ctrlKey: true, altKey: true
  });
  assert.equal(f9, "F9");
  assert.equal(chord, "Ctrl+Alt+M");
  assert.equal(Shortcut.valid(chord), true);
  assert.equal(Shortcut.valid("M"), false);
  assert.equal(Shortcut.valid("Ctrl+Ctrl+M"), false);
  assert.equal(Shortcut.shortcutFromEvent({ key: "m", code: "KeyM" }), null);
});

test("shortcuts skip typing fields; manifest only adds narrow storage permission", () => {
  assert.equal(Shortcut.editable({ closest: () => ({ tagName: "INPUT" }) }), true);
  assert.equal(Shortcut.editable({ closest: () => null }), false);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage", "offscreen"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ["assets/logo.svg"]);
});

test("OCR and language are opt-in in Finder v0.6", () => {
  const source = readFileSync(join(root, "finder-content.js"), "utf8");
  assert.match(source, /Association\.associate\(viewportShapes, safeCandidates\)/);
  assert.match(source, /chrome\.storage\.local/);
  assert.match(source, /shortcutFromEvent/);
  assert.match(source, /Idioma do texto:/);
  assert.doesNotMatch(source, /PT_RECOGNIZE|PT_TRANSLATE_REMOTE|mymemory/i);
});
