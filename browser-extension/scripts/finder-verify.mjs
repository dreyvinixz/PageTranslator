import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
assert.equal(manifest.version, "0.6.0");
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage", "offscreen"]);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
const files = readdirSync(dist).sort();
assert.deepEqual(files, ["assets", "background.js", "finder-association.js", "finder-auto.js", "finder-content.js", "finder-core.js", "finder-fit.js", "finder-instances.js", "finder-language.js", "finder-offscreen.html", "finder-offscreen.js", "finder-shortcut.js", "finder-text.js", "manifest.json"]);
assert.deepEqual(readdirSync(join(dist, "assets")), ["logo.svg"]);
assert.deepEqual(manifest.web_accessible_resources[0].resources, ["assets/logo.svg"]);
for(const path of ["vendor/tesseract.min.js","vendor/worker.min.js",
 "vendor/lang/por.traineddata.gz","vendor/lang/eng.traineddata.gz"]) {
 assert.ok(readFileSync(join(dist,path)).length>500,"missing OCR asset: "+path);
}
assert.ok(readdirSync(join(dist,"vendor","core")).some(x=>x.endsWith(".wasm")));
assert.ok(!readFileSync(join(dist, "finder-content.js"), "utf8").includes("PT_TRANSLATE"));
assert.ok(!readFileSync(join(dist, "finder-text.js"), "utf8").includes("recognize("));
console.log("Finder: OCR local empacotado com idioma PT e EN. Arquivos: " + files.join(", "));
