import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAdminDemoData } from "./lib/demo-build-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultDistDir = path.join(rootDir, "dist");

export async function buildAdminDemo({ distDir = defaultDistDir } = {}) {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const dirname of ["dashboard", "manager"]) {
    await cp(path.join(rootDir, dirname), path.join(distDir, dirname), {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.DS_Store`)
    });
  }

  const dashboardHtml = await adminDashboardHtml();
  await writeFile(path.join(distDir, "dashboard/index.html"), dashboardHtml, "utf8");
  await writeFile(path.join(distDir, "index.html"), dashboardHtml, "utf8");

  await mkdir(path.join(distDir, "data"), { recursive: true });
  const dataFiles = buildAdminDemoData();
  for (const [filename, value] of Object.entries(dataFiles)) {
    await writeJson(path.join(distDir, "data", filename), value);
  }

  console.log(`Built admin demo in ${distDir}`);
}

async function adminDashboardHtml() {
  const html = await readFile(path.join(rootDir, "dashboard/index.html"), "utf8");
  return html
    .replace("<body>", '<body data-build-target="admin-demo">')
    .replace(
      '<section class="mode-banner" id="modeBanner" hidden></section>',
      `<section class="mode-banner admin-demo-static" id="modeBanner">
        <div>
          <strong>受保护总后台演示</strong>
          <p>这个页面只应该部署在 Cloudflare Access 保护的 admin.guamee.org 后面。</p>
        </div>
      </section>`
    );
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAdminDemo();
}
