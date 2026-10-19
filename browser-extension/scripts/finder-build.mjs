import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const name of ["manifest.json", "background.js", "finder-core.js", "finder-text.js", "finder-fit.js", "finder-content.js"]) {
  copyFileSync(join(root, name), join(dist, name));
}
console.log("Finder diagnóstico criado em " + dist);
