import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public entry does not expose owner dashboard or staff route", async () => {
  const html = await readFile("public/index.html", "utf8");
  assert.ok(html.includes("/manager/?workspaceId=workspace_default"));
  assert.ok(html.includes("ad.guamee.org"));
  assert.ok(html.includes("app.guamee.org"));
  assert.equal(html.includes("/dashboard"), false);
  assert.equal(html.includes("/staff"), false);
});

test("manager page is the only public app entry and hides staff nav", async () => {
  const html = await readFile("manager/index.html", "utf8");
  assert.ok(html.includes("Workspace 管理端"));
  assert.equal(html.includes("href=\"/staff/\""), false);
});

test("public build script does not copy private dashboard or staff surfaces", async () => {
  const script = await readFile("scripts/build-public-demo.mjs", "utf8");
  assert.doesNotMatch(script, /for \(const dirname of \[[^\]]*"dashboard"/);
  assert.doesNotMatch(script, /for \(const dirname of \[[^\]]*"staff"/);
  assert.ok(script.includes("demo-manager-summary.json"));
});

test("vercel config does not rewrite public root to private dashboard", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  assert.equal(config.outputDirectory, "dist");
  assert.equal(JSON.stringify(config).includes("/dashboard"), false);
  assert.equal(JSON.stringify(config).includes("/staff"), false);
});
