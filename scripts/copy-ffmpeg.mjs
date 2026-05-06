import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const sourceDir = join(projectRoot, "node_modules", "@ffmpeg", "core", "dist", "esm");
const targetDir = join(projectRoot, "public", "ffmpeg");

if (!existsSync(sourceDir)) {
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}
