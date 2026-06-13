import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildApp } from "../scripts/build-app.mjs";
import { validateAppRelease } from "../scripts/check-app-release.mjs";

test("build:app includes app shell and manager app mode but excludes dashboard data", async () => {
  const distDir = tempDist("app");
  try {
    await buildApp({ distDir });
    const result = await validateAppRelease({ distDir });
    assert.equal(result.ok, true, result.errors.join("\n"));
    const managerJs = await readFile(path.join(distDir, "manager/js/app.js"), "utf8");
    assert.ok(managerJs.includes("/api/app/v1/session"));
    assert.ok(managerJs.includes("params.get(\"appMode\") === \"1\""));
    await assert.rejects(readFile(path.join(distDir, "dashboard/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "staff/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "data/latest.json"), "utf8"));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("release:check:app blocks dashboard leakage", async () => {
  const distDir = tempDist("app-bad");
  try {
    await buildApp({ distDir });
    await mkdir(path.join(distDir, "dashboard"), { recursive: true });
    await writeFile(path.join(distDir, "dashboard/index.html"), "private dashboard", "utf8");
    const result = await validateAppRelease({ distDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("dashboard")));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("manager public preview does not enter app API mode by default", async () => {
  const js = await readFile(path.join(process.cwd(), "manager/js/app.js"), "utf8");
  assert.ok(js.includes('appMode: params.get("appMode") === "1"'));
  assert.ok(js.includes("if (state.appMode)"));
  assert.ok(js.includes("/api/manager/summary"));
});

function tempDist(name) {
  return path.join(os.tmpdir(), `ai-creator-os-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
