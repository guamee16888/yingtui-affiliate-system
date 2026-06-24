import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoManagerSummary } from "../lib/demo-build-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const defaultDistDir = path.join(rootDir, "dist");

export async function buildPublicDemo({ distDir = defaultDistDir } = {}) {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const dirname of ["public", "manager"]) {
    await cp(path.join(rootDir, dirname), path.join(distDir, dirname), {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.DS_Store`)
    });
  }

  await cp(path.join(rootDir, "public/index.html"), path.join(distDir, "index.html"));
  await mkdir(path.join(distDir, "data"), { recursive: true });
  await writeJson(path.join(distDir, "data/demo-manager-summary.json"), buildDemoManagerSummary());
  console.log(`Built public demo in ${distDir}`);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildPublicDemo();
}
