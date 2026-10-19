import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("activeTab"));
assert.ok(!manifest.permissions.includes("tabs"));
assert.ok(!manifest.host_permissions.includes("<all_urls>"));
assert.deepEqual(manifest.host_permissions, ["https://api.mymemory.translated.net/*"]);
for (const file of ["background.js", "content.js", "offscreen.js", "offscreen.html",
  "vendor/tesseract.min.js", "vendor/worker.min.js", "vendor/lang/eng.traineddata.gz"]) {
  assert.ok(existsSync(join(dist, file)), "Não encontrado: " + file);
}
const coreFiles = readdirSync(join(dist, "vendor", "core"));
assert.ok(coreFiles.some((file) => file.endsWith(".wasm")));
assert.ok(coreFiles.some((file) => file.endsWith(".wasm.js")));
const offscreen = readFileSync(join(dist, "offscreen.js"), "utf8");
assert.ok(offscreen.includes("workerBlobURL: false"));
assert.ok(offscreen.includes("cacheMethod: \"none\""));
console.log("Validação estática concluída: MV3, permissões e OCR local.");
