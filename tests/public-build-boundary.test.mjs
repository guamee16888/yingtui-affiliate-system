import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPublicDemo } from "../scripts/build/build-public-demo.mjs";
import { validatePublicRelease } from "../scripts/build/check-public-release.mjs";

test("build:public excludes private dashboard staff and real data", async () => {
  const distDir = await tempDist("public-build");
  try {
    await buildPublicDemo({ distDir });
    const result = await validatePublicRelease({ distDir });
    assert.equal(result.ok, true, result.errors.join("\n"));
    const root = await readFile(path.join(distDir, "index.html"), "utf8");
    assert.equal(root.includes("/dashboard"), false);
    assert.equal(root.includes("/staff"), false);
    await assert.rejects(readFile(path.join(distDir, "dashboard/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "staff/index.html"), "utf8"));
    await assert.rejects(readFile(path.join(distDir, "data/latest.json"), "utf8"));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test("release:check:public blocks dashboard leakage", async () => {
  const distDir = await tempDist("public-bad");
  try {
    await buildPublicDemo({ distDir });
    await mkdir(path.join(distDir, "dashboard"), { recursive: true });
    await writeFile(path.join(distDir, "dashboard/index.html"), "private", "utf8");
    const result = await validatePublicRelease({ distDir });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("dashboard")));
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

async function tempDist(name) {
  return path.join(await os.tmpdir(), `ai-creator-os-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
