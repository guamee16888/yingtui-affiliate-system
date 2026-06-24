import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDesktopAppDataDir } from "../../desktop/app-config.mjs";
import { findSensitiveText, runDesktopPackageCheck } from "./desktop-package-check.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

export async function runMacTrialSmoke(options = {}) {
  const releaseDir = path.resolve(options.releaseDir || path.join(rootDir, "release-local", "mac-trial"));
  const packageDir = path.resolve(options.packageDir || path.join(rootDir, "dist-desktop"));
  const assetsDir = path.resolve(options.assetsDir || path.join(rootDir, "assets"));
  const errors = [];
  const passed = [];

  const packageCheck = await runDesktopPackageCheck({ packageDir });
  errors.push(...packageCheck.errors);
  passed.push(...packageCheck.passed.map((item) => `Package check: ${item}`));

  const releaseFiles = await listFilesSafe(releaseDir);
  const packageFiles = await listFilesSafe(packageDir);
  const dmg = releaseFiles.find((file) => file.endsWith(".dmg"));
  const zip = releaseFiles.find((file) => file.endsWith(".zip"));
  const readme = path.join(releaseDir, "README-MAC-TRIAL.md");
  const appBundle = packageFiles.find((file) => file.endsWith("mac-arm64/AI Creator OS.app/Contents/Info.plist"))
    || packageFiles.find((file) => file.endsWith(".app/Contents/Info.plist"));
  const appIcon = packageFiles.find((file) => file.includes(".app/Contents/Resources/") && file.endsWith(".icns"));

  await checkExists(path.join(assetsDir, "icon.png"), "icon.png exists", errors, passed);
  await checkExists(path.join(assetsDir, "icon.icns"), "icon.icns exists", errors, passed);
  await checkExists(path.join(assetsDir, "mac", "icon.icns"), "assets/mac/icon.icns exists", errors, passed);
  if (!dmg) errors.push("Missing Mac trial DMG in release-local/mac-trial.");
  else passed.push(`DMG exists: ${path.basename(dmg)}`);
  if (!zip) errors.push("Missing Mac trial ZIP in release-local/mac-trial.");
  else passed.push(`ZIP exists: ${path.basename(zip)}`);
  await checkExists(readme, "README-MAC-TRIAL.md exists", errors, passed);
  if (!appBundle) errors.push("Missing packaged .app in dist-desktop.");
  else passed.push(`Packaged .app exists: ${relative(appBundle)}`);
  if (!appIcon) errors.push("Packaged .app does not contain an icns icon.");
  else passed.push(`Packaged app icon exists: ${relative(appIcon)}`);

  try {
    const pngInfo = await readPngInfo(path.join(assetsDir, "icon.png"));
    if (pngInfo.width < 1024 || pngInfo.height < 1024) {
      errors.push(`icon.png must be at least 1024x1024, got ${pngInfo.width}x${pngInfo.height}.`);
    } else {
      passed.push(`icon.png size is ${pngInfo.width}x${pngInfo.height}`);
    }
  } catch (error) {
    errors.push(error.message);
  }

  const appDataDir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  if (appDataDir.includes(`${path.sep}Documents${path.sep}`) || appDataDir.endsWith(`${path.sep}data`)) {
    errors.push(`Desktop data dir points at repo data: ${appDataDir}`);
  } else {
    passed.push("Desktop data directory is outside repo data");
  }

  for (const file of [...packageFiles, ...releaseFiles]) {
    const ext = path.extname(file);
    if (![".js", ".mjs", ".json", ".html", ".css", ".md", ".yml", ".yaml", ".plist", ".txt"].includes(ext)) continue;
    const text = await readFile(file, "utf8");
    for (const finding of findSensitiveText(text)) {
      errors.push(`${relative(file)}: ${finding}`);
    }
  }

  return { releaseDir, packageDir, errors, passed };
}

export async function readPngInfo(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) {
    throw new Error(`${filePath} is not a PNG with an IHDR chunk.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function checkExists(filePath, label, errors, passed) {
  try {
    await access(filePath);
    passed.push(label);
  } catch {
    errors.push(`Missing ${label}: ${filePath}`);
  }
}

async function listFilesSafe(dir) {
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

async function walk(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
    else if ((await stat(fullPath)).isFile()) files.push(fullPath);
  }
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function printReport(result) {
  console.log("Mac trial smoke");
  for (const item of result.passed) console.log(`PASS ${item}`);
  for (const item of result.errors) console.error(`ERROR ${item}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMacTrialSmoke().then((result) => {
    printReport(result);
    if (result.errors.length) process.exit(1);
  }).catch((error) => {
    console.error(`Mac trial smoke failed: ${error.message}`);
    process.exit(1);
  });
}
