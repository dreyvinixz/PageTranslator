import { copyFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const name of ["manifest.json", "background.js", "finder-core.js", "finder-text.js", "finder-fit.js", "finder-association.js", "finder-instances.js", "finder-language.js", "finder-shortcut.js", "finder-auto.js", "finder-content.js", "finder-offscreen.js", "finder-offscreen.html"]) {
  copyFileSync(join(root, name), join(dist, name));
}
mkdirSync(join(dist, "assets"), { recursive: true });
copyFileSync(join(root, "assets", "logo.svg"), join(dist, "assets", "logo.svg"));
// All OCR assets are packaged locally; no runtime download from arbitrary CDNs.
const vendor=join(dist,"vendor");
mkdirSync(join(vendor,"core"),{recursive:true});
mkdirSync(join(vendor,"lang"),{recursive:true});
const deps=(...p)=>join(root,"node_modules",...p);
copyFileSync(deps("tesseract.js","dist","tesseract.min.js"),join(vendor,"tesseract.min.js"));
copyFileSync(deps("tesseract.js","dist","worker.min.js"),join(vendor,"worker.min.js"));
const wasmRoot=deps("tesseract.js-core");
const wasmFiles=readdirSync(wasmRoot).filter(x=>/^tesseract-core.*\\.(wasm|js)$/.test(x));
if(!wasmFiles.length)throw Error("Tesseract WebAssembly not installed.");
for(const file of wasmFiles)copyFileSync(join(wasmRoot,file),join(vendor,"core",file));
for(const language of ["por","eng"]) {
  copyFileSync(deps("@tesseract.js-data",language,"4.0.0_best_int",language+".traineddata.gz"),
    join(vendor,"lang",language+".traineddata.gz"));
}
console.log("Finder v0.6.0 OCR local criado em "+dist);
