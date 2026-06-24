import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAdminDemo } from "../scripts/build/build-admin-demo.mjs";
import { validateAdminRelease } from "../scripts/build/check-admin-release.mjs";

test("build:admin-demo includes protected dashboard with sanitized data", async () => {
  const distDir = tempDist("admin-build");
  try {
    await buildAdminDemo({ distDir });
    const result = await validateAdminRelease({ distDir });
    assert.equal(result.ok, true, result.errors.join("\n"));
    const dashboard = await readFile(path.join(distDir, "dashboard/index.html"), "utf8");
    assert.ok(dashboard.includes("受保护总后台演示"));
    assert.ok(dashboard.includes("Cloudflare Access"));
    const settings = JSON.parse(await readFile(path.join(distDir, "data/publish-settings.json"), "utf8"));
    const feedbackOps = JSON.parse(await readFile(path.join(distDir, "data/feedback-ops.json"), "utf8"));
    assert.equal(settings.settings.globalAutoPublishEnabled, false);
    assert.equal(settings.settings.dryRunByDefault, true);
    assert.equal(settings.settings.allowedPublishModes.includes("auto"), false);
    assert.equal(feedbackOps.summary.pendingMetrics, 0);
    await assert.rejects(readFile(path.join(distDir, "output/2026-06-13-daily-x-pack.md"), "utf8"));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("release:check:admin blocks token leakage", async () => {
  const distDir = tempDist("admin-token");
  try {
    await buildAdminDemo({ distDir });
    await writeFile(path.join(distDir, "data/x-connections.json"), JSON.stringify({ items: [{ access_token: "secret" }] }), "utf8");
    const result = await validateAdminRelease({ distDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("token")));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

function tempDist(name) {
  return path.join(os.tmpdir(), `ai-creator-os-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
