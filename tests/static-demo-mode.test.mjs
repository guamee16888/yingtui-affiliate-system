import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

test("public entry exposes three read-only demo entry points", async () => {
  const html = await readProjectFile("public/index.html");

  assert.match(html, /AI Creator OS/);
  assert.match(html, /A multi-account X content operations system/);
  assert.match(html, /\/dashboard\//);
  assert.match(html, /\/manager\/\?workspaceId=workspace_default/);
  assert.match(html, /\/staff\/\?workspaceId=workspace_default&userId=user_owner/);
  assert.equal((html.match(/class="demo-pill">只读演示/g) || []).length, 3);
});

test("dashboard, manager, and staff expose demo mode banners", async () => {
  const dashboardHtml = await readProjectFile("dashboard/index.html");
  const managerHtml = await readProjectFile("manager/index.html");
  const staffHtml = await readProjectFile("staff/index.html");

  assert.match(dashboardHtml, /id="modeBanner"/);
  assert.match(managerHtml, /id="modeBanner"/);
  assert.match(staffHtml, /id="modeBanner"/);
});

test("public demo pages block write operations in read-only mode", async () => {
  const dashboardJs = await readProjectFile("dashboard/js/app.js");
  const managerJs = await readProjectFile("manager/js/app.js");
  const staffJs = await readProjectFile("staff/js/app.js");

  assert.match(dashboardJs, /guamee\.org/);
  assert.match(dashboardJs, /\.pages\.dev/);
  assert.match(dashboardJs, /vercel\.app/);
  assert.match(dashboardJs, /只读演示模式/);
  assert.match(dashboardJs, /演示环境不支持写入/);

  for (const js of [managerJs, staffJs]) {
    assert.match(js, /function isReadOnlyMode/);
    assert.match(js, /deployment\?\.readOnly/);
    assert.match(js, /function renderModeBanner/);
    assert.match(js, /演示环境不支持写入/);
    assert.match(js, /if \(isReadOnlyMode\(\)\) throw new Error/);
  }
});

test("demo build command uses sanitized data and release check before Cloudflare deploy", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const buildStatic = await readProjectFile("scripts/build-static.mjs");

  assert.equal(packageJson.scripts["build:demo"], "npm run demo:sanitize && node scripts/build-static.mjs --demo");
  assert.match(packageJson.scripts["deploy:cloudflare"], /npm run build:demo && npm run release:check/);
  assert.match(buildStatic, /const dataDirName = demoMode \? "data-demo" : "data"/);
  assert.match(buildStatic, /const configDirName = demoMode \? "config-demo" : "config"/);
  assert.match(buildStatic, /Demo mode: generated markdown exports are intentionally not published/);
});

async function readProjectFile(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}
