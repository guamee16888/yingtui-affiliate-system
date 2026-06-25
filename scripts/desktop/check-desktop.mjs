import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIncognitoAccountWindowConfig } from "../lib/desktop-browser-launcher.mjs";
import { DEFAULT_DESKTOP_PORT, getDesktopAppDataDir, RESERVED_WEB_PORTS } from "../../desktop/app-config.mjs";
import { readJson } from "../lib/file-store.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const errors = [];
const passed = [];

await checkFiles();
await checkPackageScripts();
await checkPortAndDataDir();
await checkIncognitoConfig();
await checkBuildConfig();
await checkNoUnsafeAutomation();

if (errors.length) {
  console.error("Desktop check failed");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Desktop check passed");
  for (const item of passed) console.log(`- ${item}`);
}

async function checkFiles() {
  for (const file of [
    "desktop/main.mjs",
    "desktop/preload.mjs",
    "desktop/browser-window-manager.mjs",
    "desktop/first-run.mjs",
    "desktop/menu.mjs",
    "desktop/app-config.mjs",
    "desktop/runtime-url.mjs",
    "desktop/README.md",
    "scripts/desktop/desktop-dev.mjs",
    "scripts/desktop/desktop-health-check.mjs",
    "scripts/desktop/desktop-doctor.mjs",
    "scripts/desktop/desktop-package-check.mjs",
    "scripts/desktop/desktop-release-mac-trial.mjs",
    "scripts/desktop/desktop-mac-trial-smoke.mjs",
    "scripts/desktop/desktop-runtime-cleanup.mjs",
    "scripts/desktop/desktop-visible-text-audit.mjs",
    "scripts/desktop/generate-mac-icon.mjs",
    "scripts/lib/desktop-browser-launcher.mjs",
    "scripts/lib/storage/interface.mjs",
    "scripts/lib/account-health-engine.mjs",
    "scripts/lib/relationship-targets.mjs",
    "manager/js/desktop-onboarding.js",
    "manager/js/desktop-data-setup.js",
    "desktop/seed-data/workspaces.json",
    "assets/README.md",
    "docs/desktop/windows-packaging.md",
    "data/relationship-targets.json",
    "electron-builder.yml"
  ]) {
    try {
      await readFile(path.join(rootDir, file), "utf8");
      passed.push(`File exists: ${file}`);
    } catch {
      errors.push(`Missing desktop file: ${file}`);
    }
  }
}

async function checkPackageScripts() {
  const pkg = await readJson("package.json", { scripts: {} });
  for (const script of [
    "desktop:dev",
    "desktop:doctor",
    "desktop:pack",
    "desktop:pack:dir",
    "desktop:pack:mac",
    "desktop:pack:win",
    "desktop:package-check",
    "desktop:runtime:cleanup",
    "desktop:ui:audit",
    "desktop:smoke:mac",
    "desktop:smoke:packaged",
    "desktop:release:mac-trial",
    "desktop:smoke:mac-trial",
    "icon:mac",
    "desktop:check"
  ]) {
    if (pkg.scripts?.[script]) passed.push(`Package script exists: ${script}`);
    else errors.push(`Missing package script: ${script}`);
  }
}

function checkPortAndDataDir() {
  if (DEFAULT_DESKTOP_PORT !== 5288) errors.push("Desktop default port must be 5288.");
  else passed.push("Desktop default port is 5288");
  if (RESERVED_WEB_PORTS.has(DEFAULT_DESKTOP_PORT)) errors.push("Desktop default port uses a reserved web port.");
  else passed.push("Desktop default port avoids 4173/4174/4175");
  const dataDir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  if (dataDir.includes(`${path.sep}Documents${path.sep}`) || dataDir.includes(`${path.sep}data`)) {
    errors.push("Desktop data directory appears to point at repo data.");
  } else {
    passed.push("Desktop data directory uses OS app support path");
  }
}

function checkIncognitoConfig() {
  const config = buildIncognitoAccountWindowConfig({
    workspaceId: "workspace_default",
    accountId: "acc_1",
    handle: "@example",
    timestamp: 123
  });
  const partition = config.browserWindowOptions.webPreferences.partition;
  if (!partition.startsWith("temp:")) errors.push("Incognito account window must use temp partition.");
  else passed.push("Incognito account window uses temp partition");
  if (partition.startsWith("persist:")) errors.push("Incognito account window must not use persist partition.");
  if (config.url !== "https://x.com/example") errors.push("Incognito account window URL should default to x.com/<handle>.");
  if (!config.notice.includes("人工")) errors.push("Incognito notice is missing manual-operation wording.");
}

async function checkBuildConfig() {
  const config = await readFile(path.join(rootDir, "electron-builder.yml"), "utf8");
  for (const expected of ["org.guamee.aicreatoros.desktop", "AI Creator OS", "artifactName", "assets/mac/icon.icns", "dmg", "zip", "dir", "nsis", "portable", "dist-desktop"]) {
    if (config.includes(expected)) passed.push(`Electron build config includes ${expected}`);
    else errors.push(`Electron build config missing ${expected}`);
  }
  for (const excluded of ["!data/**", "!output/**", "!config/**", "!release-local/**"]) {
    if (config.includes(excluded)) passed.push(`Electron build config excludes ${excluded}`);
    else errors.push(`Electron build config should exclude ${excluded}`);
  }
}

async function checkNoUnsafeAutomation() {
  const files = [
    "desktop/main.mjs",
    "desktop/browser-window-manager.mjs",
    "scripts/lib/desktop-browser-launcher.mjs"
  ];
  const forbidden = [
    /\bwebdriver\b/i,
    /\bpuppeteer\b/i,
    /\bplaywright\b/i,
    /\bfollow_button\b/i,
    /\.click\(\)/i,
    /import\s+.*cookie/i
  ];
  for (const file of files) {
    const text = await readFile(path.join(rootDir, file), "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) errors.push(`Unsafe browser automation pattern in ${file}: ${pattern}`);
    }
  }
  passed.push("No unsafe desktop browser automation patterns found");
}
