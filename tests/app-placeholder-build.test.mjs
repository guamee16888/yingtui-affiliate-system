import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAppPlaceholder } from "../scripts/build-app-placeholder.mjs";
import { validateAppPlaceholderRelease } from "../scripts/check-app-placeholder-release.mjs";

test("build:app-placeholder outputs only the protected app placeholder", async () => {
  const distDir = tempDist("app-placeholder");
  try {
    await buildAppPlaceholder({ distDir });
    const result = await validateAppPlaceholderRelease({ distDir });
    assert.equal(result.ok, true, result.errors.join("\n"));
    const index = await readFile(path.join(distDir, "index.html"), "utf8");
    assert.ok(index.includes("AI Creator OS App"));
    assert.ok(index.includes("受保护应用预览"));
    assert.ok(index.includes("app.guamee.org"));
    await assert.rejects(readFile(path.join(distDir, "dashboard/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "manager/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "staff/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "data/latest.json"), "utf8"));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("release:check:app-placeholder blocks data leakage", async () => {
  const distDir = tempDist("app-placeholder-bad");
  try {
    await buildAppPlaceholder({ distDir });
    await mkdir(path.join(distDir, "data"), { recursive: true });
    await writeFile(path.join(distDir, "data/latest.json"), JSON.stringify({ token: "secret" }), "utf8");
    const result = await validateAppPlaceholderRelease({ distDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("data") || error.includes("token")));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

function tempDist(name) {
  return path.join(os.tmpdir(), `ai-creator-os-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
