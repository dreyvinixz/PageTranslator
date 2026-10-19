import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const vendor = join(dist, "vendor");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(vendor, "core"), { recursive: true });
mkdirSync(join(vendor, "lang"), { recursive: true });

for (const name of ["manifest.json", "background.js", "content.js", "auto-content.js", "regions.js", "offscreen.html", "offscreen.js"]) {
  copyFileSync(join(root, name), join(dist, name));
}

const dependency = (...parts) => join(root, "node_modules", ...parts);
copyFileSync(dependency("tesseract.js", "dist", "tesseract.min.js"), join(vendor, "tesseract.min.js"));
copyFileSync(dependency("tesseract.js", "dist", "worker.min.js"), join(vendor, "worker.min.js"));

const core = dependency("tesseract.js-core");
const wasmFiles = readdirSync(core).filter((name) => /^tesseract-core.*\.(wasm|js)$/.test(name));
if (!wasmFiles.length) throw new Error("Tesseract WASM ausente em node_modules.");
for (const file of wasmFiles) copyFileSync(join(core, file), join(vendor, "core", file));

const trained = dependency("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz");
if (!existsSync(trained)) throw new Error("Modelo de inglês não encontrado: " + trained);
copyFileSync(trained, join(vendor, "lang", "eng.traineddata.gz"));

console.log("Extensão Chromium montada em " + dist);
console.log("Tesseract Core: " + wasmFiles.join(", "));
