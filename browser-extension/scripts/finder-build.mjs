import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const name of ["manifest.json", "background.js", "finder-core.js", "finder-text.js", "finder-fit.js", "finder-association.js", "finder-shortcut.js", "finder-auto.js", "finder-content.js"]) {
  copyFileSync(join(root, name), join(dist, name));
}
mkdirSync(join(dist, "assets"), { recursive: true });
copyFileSync(join(root, "assets", "logo.svg"), join(dist, "assets", "logo.svg"));
console.log("Finder v0.5.0 preview criado em " + dist);
