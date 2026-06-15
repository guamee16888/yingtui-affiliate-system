import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runMacTrialSmoke } from "../scripts/desktop-mac-trial-smoke.mjs";

test("mac trial smoke reports missing DMG", async () => {
  const { packageDir, releaseDir } = await makeTrialFixture();
  await writeFile(path.join(releaseDir, "AI-Creator-OS-0.1.0-mac-arm64.zip"), "zip");
  await writeFile(path.join(releaseDir, "README-MAC-TRIAL.md"), "readme");
  const result = await runMacTrialSmoke({ packageDir, releaseDir });
  assert.ok(result.errors.some((error) => error.includes("Missing Mac trial DMG")));
});

test("mac trial smoke reports token leakage", async () => {
  const { packageDir, releaseDir } = await makeTrialFixture();
  await writeReleaseFiles(releaseDir);
  await writePackageFile(packageDir, "mac-arm64/AI Creator OS.app/Contents/Resources/app/desktop/leak.mjs", "const access_token = 'sk-abcdefghijklmnopqrstuvwxyz123456';");
  const result = await runMacTrialSmoke({ packageDir, releaseDir });
  assert.ok(result.errors.some((error) => error.includes("token-looking secret value") || error.includes("inline API key assignment")));
});

test("mac trial smoke reports repo data packaged into the app", async () => {
  const { packageDir, releaseDir } = await makeTrialFixture();
  await writeReleaseFiles(releaseDir);
  await writePackageFile(packageDir, "mac-arm64/AI Creator OS.app/Contents/Resources/app/data/latest.json", "{}");
  const result = await runMacTrialSmoke({ packageDir, releaseDir });
  assert.ok(result.errors.some((error) => error.includes("data/latest.json")));
});

async function makeTrialFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-creator-os-mac-trial-"));
  const packageDir = path.join(root, "dist-desktop");
  const releaseDir = path.join(root, "release-local", "mac-trial");
  await mkdir(releaseDir, { recursive: true });
  await writeCleanPackage(packageDir);
  return { packageDir, releaseDir };
}

async function writeCleanPackage(packageDir) {
  const appRoot = "mac-arm64/AI Creator OS.app/Contents";
  await writePackageFile(packageDir, `${appRoot}/Info.plist`, "<plist><string>AI Creator OS</string></plist>");
  await writePackageFile(packageDir, `${appRoot}/Resources/icon.icns`, "icon");
  await writePackageFile(packageDir, `${appRoot}/Resources/app/package.json`, JSON.stringify({
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
    "scripts/serve-dashboard.mjs"
  ]) {
    await writePackageFile(packageDir, `${appRoot}/Resources/app/${file}`, "demo");
  }
}

async function writeReleaseFiles(releaseDir) {
  await writeFile(path.join(releaseDir, "AI-Creator-OS-0.1.0-mac-arm64.dmg"), "dmg");
  await writeFile(path.join(releaseDir, "AI-Creator-OS-0.1.0-mac-arm64.zip"), "zip");
  await writeFile(path.join(releaseDir, "README-MAC-TRIAL.md"), "readme");
}

async function writePackageFile(root, relativePath, text) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}
