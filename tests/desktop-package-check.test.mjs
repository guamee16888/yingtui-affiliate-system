import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSensitiveText, runDesktopPackageCheck } from "../scripts/desktop/desktop-package-check.mjs";

test("desktop package check passes a clean app bundle shape", async () => {
  const root = await makePackageRoot();
  const appRoot = path.join(root, "mac-arm64", "AI Creator OS.app", "Contents", "Resources", "app");
  await writePackageFile(root, "mac-arm64/AI Creator OS.app/Contents/Info.plist", "<plist><string>AI Creator OS</string></plist>");
  await writePackageFile(root, "mac-arm64/AI Creator OS.app/Contents/Resources/app/package.json", JSON.stringify({
    version: "0.1.0",
    main: "desktop/main.mjs"
  }));
  for (const file of [
    "desktop/main.mjs",
    "desktop/preload.mjs",
    "desktop/app-config.mjs",
    "desktop/browser-window-manager.mjs",
    "desktop/seed-data/workspaces.json",
    "manager/index.html",
    "scripts/ops/serve-dashboard.mjs"
  ]) {
    await writePackageFile(appRoot, file, "demo");
  }

  const result = await runDesktopPackageCheck({ packageDir: root });
  assert.deepEqual(result.errors, []);
});

test("desktop package check detects forbidden runtime files", async () => {
  const root = await makePackageRoot();
  await writePackageFile(root, "mac-arm64/AI Creator OS.app/Contents/Resources/app/.env", "X_ACCESS_TOKEN=abc");
  await writePackageFile(root, "mac-arm64/AI Creator OS.app/Contents/Resources/app/data/latest.json", "{}");

  const result = await runDesktopPackageCheck({ packageDir: root });
  assert.ok(result.errors.some((error) => error.includes(".env")));
  assert.ok(result.errors.some((error) => error.includes("data/latest.json")));
});

test("desktop package check detects token-looking and posted URL text", () => {
  const findings = findSensitiveText(`
    X_ACCESS_TOKEN="sk-abcdefghijklmnopqrstuvwxyz123456"
    https://x.com/i/web/status/2065587926495641808
  `);
  assert.ok(findings.includes("token-looking secret value"));
  assert.ok(findings.includes("inline API key assignment"));
  assert.ok(findings.includes("posted X status URL"));
});

async function makePackageRoot() {
  return mkdtemp(path.join(os.tmpdir(), "ai-creator-os-package-check-"));
}

async function writePackageFile(root, relativePath, text) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}
