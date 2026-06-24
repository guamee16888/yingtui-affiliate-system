import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDesktopAppDataDir } from "../../desktop/app-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");
export const DEFAULT_PACKAGE_DIR = path.join(rootDir, "dist-desktop");
export const PACKAGE_TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".plist",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

export async function runDesktopPackageCheck(options = {}) {
  const packageDir = path.resolve(options.packageDir || DEFAULT_PACKAGE_DIR);
  const files = await collectPackageFiles(packageDir);
  const relativeFiles = files.map((file) => normalize(path.relative(packageDir, file)));
  const errors = [];
  const passed = [];
  const warnings = [];

  if (!relativeFiles.length) errors.push(`No packaged files found in ${packageDir}`);
  else passed.push(`Package directory exists: ${packageDir}`);

  checkForbiddenPaths(relativeFiles, errors, passed);
  checkRequiredRuntimeFiles(relativeFiles, errors, passed);
  await checkTextPayloads({ packageDir, files, errors, passed });
  await checkPackageMetadata({ packageDir, files, errors, passed, warnings });
  checkDesktopDataDir(errors, passed);

  return { packageDir, files: relativeFiles, errors, passed, warnings };
}

export async function collectPackageFiles(dir) {
  try {
    await access(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  await walk(dir, files);
  return files;
}

function checkForbiddenPaths(relativeFiles, errors, passed) {
  const forbidden = [
    { label: ".env", pattern: /(^|\/)\.env(?:\.|$)/ },
    { label: ".wrangler", pattern: /(^|\/)\.wrangler(?:\/|$)/ },
    { label: "repo data/latest.json", pattern: /(^|\/)data\/latest\.json$/ },
    { label: "repo output markdown", pattern: /(^|\/)output\/.*\.md$/ },
    { label: "repo runtime daily data", pattern: /(^|\/)data\/daily\// },
    { label: "repo config", pattern: /(^|\/)config\// }
  ];
  for (const item of forbidden) {
    const found = relativeFiles.find((file) => item.pattern.test(file));
    if (found) errors.push(`Packaged ${item.label}: ${found}`);
    else passed.push(`No packaged ${item.label}`);
  }
}

function checkRequiredRuntimeFiles(relativeFiles, errors, passed) {
  const required = [
    "package.json",
    "desktop/main.mjs",
    "desktop/preload.mjs",
    "desktop/app-config.mjs",
    "desktop/browser-window-manager.mjs",
    "desktop/seed-data/workspaces.json",
    "manager/index.html",
    "scripts/ops/serve-dashboard.mjs"
  ];
  for (const requiredFile of required) {
    if (hasPackagedPath(relativeFiles, requiredFile)) passed.push(`Runtime file present: ${requiredFile}`);
    else errors.push(`Missing packaged runtime file: ${requiredFile}`);
  }
}

async function checkTextPayloads({ packageDir, files, errors, passed }) {
  const findings = [];
  for (const file of files) {
    const rel = normalize(path.relative(packageDir, file));
    if (rel.includes("/node_modules/") || rel.endsWith("scripts/desktop/desktop-package-check.mjs")) continue;
    if (!PACKAGE_TEXT_EXTENSIONS.has(path.extname(file))) continue;
    const text = await readFile(file, "utf8");
    for (const finding of findSensitiveText(text)) findings.push(`${rel}: ${finding}`);
  }
  if (findings.length) errors.push(...findings);
  else passed.push("No sensitive token, posted URL, or affiliate tracking values found in packaged app source");
}

export function findSensitiveText(text) {
  const checks = [
    {
      label: "token-looking secret value",
      pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,})\b/g
    },
    {
      label: "inline API key assignment",
      pattern: /\b(?:[A-Za-z0-9]+[_-])?(?:api[_-]?key|secret|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/gi
    },
    {
      label: "posted X status URL",
      pattern: /https?:\/\/(?:x|twitter)\.com\/i\/web\/status\/\d+/gi
    },
    {
      label: "affiliate tracking URL",
      pattern: /https?:\/\/[^\s"'<>]+(?:[?&](?:ref|via|affiliate|partner|aff|utm_source)=|partnerstack|rewardful|impact\.com)[^\s"'<>]*/gi
    }
  ];
  const findings = [];
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    if (check.pattern.test(text)) findings.push(check.label);
  }
  return findings;
}

async function checkPackageMetadata({ packageDir, files, errors, passed, warnings }) {
  const pkgFile = files.find((file) => {
    const rel = normalize(path.relative(packageDir, file));
    return rel === "package.json" || rel.endsWith("/Resources/app/package.json") || rel.endsWith("/resources/app/package.json");
  });
  if (!pkgFile) return;
  const pkg = JSON.parse(await readFile(pkgFile, "utf8"));
  const rootPkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  if (pkg.version === rootPkg.version) passed.push(`Package version matches package.json: ${pkg.version}`);
  else errors.push(`Package version mismatch: ${pkg.version || "(missing)"} != ${rootPkg.version}`);
  if (pkg.main === "desktop/main.mjs") passed.push("Package main points to desktop/main.mjs");
  else errors.push(`Package main should be desktop/main.mjs, got ${pkg.main || "(missing)"}`);

  const appBundle = files.find((file) => file.endsWith(".app/Contents/Info.plist"));
  if (appBundle) {
    const plist = await readFile(appBundle, "utf8");
    if (plist.includes("AI Creator OS")) passed.push("macOS app bundle name is AI Creator OS");
    else errors.push("macOS app bundle name does not include AI Creator OS");
  } else {
    warnings.push("No macOS .app bundle found. Run desktop:pack:dir or desktop:pack:mac before mac smoke.");
  }
}

function checkDesktopDataDir(errors, passed) {
  const macDir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  const winDir = getDesktopAppDataDir("win32", { APPDATA: "C:\\Users\\example\\AppData\\Roaming" });
  const bad = [macDir, winDir].find((item) => item.includes(`${path.sep}Documents${path.sep}`) || item.endsWith(`${path.sep}data`));
  if (bad) errors.push(`Desktop data directory points at repo data: ${bad}`);
  else passed.push("Desktop data directory remains in OS appData");
}

async function walk(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
    else {
      const info = await stat(fullPath);
      if (info.isFile()) files.push(fullPath);
    }
  }
}

function hasPackagedPath(files, expected) {
  return files.some((file) => file === expected || file.endsWith(`/Resources/app/${expected}`) || file.endsWith(`/resources/app/${expected}`));
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function printReport(result) {
  console.log("Desktop package check");
  for (const item of result.passed) console.log(`PASS ${item}`);
  for (const item of result.warnings) console.warn(`WARN ${item}`);
  for (const item of result.errors) console.error(`ERROR ${item}`);
}

async function main() {
  const packageDir = process.argv.includes("--package-dir")
    ? process.argv[process.argv.indexOf("--package-dir") + 1]
    : DEFAULT_PACKAGE_DIR;
  const result = await runDesktopPackageCheck({ packageDir });
  printReport(result);
  if (result.errors.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Desktop package check failed: ${error.message}`);
    process.exit(1);
  });
}
