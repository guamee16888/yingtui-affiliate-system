import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const dirname of ["dashboard", "data", "output", "public"]) {
  await cp(path.join(rootDir, dirname), path.join(distDir, dirname), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
      && !source.includes(`${path.sep}data${path.sep}backups`)
  });
}

await writeFile(
  path.join(distDir, "index.html"),
  "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url=/dashboard/\"><title>Affiliate Dashboard</title><a href=\"/dashboard/\">Open Dashboard</a>\n"
);

console.log(`Built static dashboard in ${distDir}`);
