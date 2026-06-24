import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const defaultDistDir = path.join(rootDir, "dist");

export async function buildAppPlaceholder({ distDir = defaultDistDir } = {}) {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(path.join(rootDir, "app-placeholder"), distDir, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });
  console.log(`Built app placeholder in ${distDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAppPlaceholder();
}
