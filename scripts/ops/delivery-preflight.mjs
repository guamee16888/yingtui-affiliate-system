import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultAppDataDir = path.join(os.homedir(), "Library", "Application Support", "AI Creator OS");
const privateSourceDirs = ["data/", "output/", "dist/", "dist-desktop/", "release/", "release-local/"];
const desktopRuntimeSections = ["data", "config", "output", "logs"];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = buildDeliveryPreflightReport(collectDeliveryPreflightState());
  printDeliveryPreflightReport(report);
  if (report.errors.length) process.exitCode = 1;
}

export function collectDeliveryPreflightState({ rootDir = defaultRootDir, appDataDir = defaultAppDataDir } = {}) {
  const trackedFiles = git(["ls-files"], rootDir);
  const stagedFiles = git(["diff", "--cached", "--name-only"], rootDir);
  const statusLines = git(["status", "--porcelain=v1"], rootDir, { trimLines: false });
  const changedFiles = statusLines.map(parseStatusPath).filter(Boolean);
  const envFiles = topLevelFiles(rootDir).filter((file) => isPrivateEnvFile(file));
  const sourceArchiveFiles = topLevelFiles(rootDir).filter((file) => /\.(?:zip|tar\.gz|tgz)$/i.test(file));
  const openClawRuntimeFiles = existingOpenClawRuntimeFiles(rootDir);
  const runtimeSections = desktopRuntimeSections.filter((section) => existsSync(path.join(appDataDir, section)));
  const browserRuntimeFiles = ["Cookies", "Cookies-journal", "Local State", "Session Storage"]
    .filter((item) => existsSync(path.join(appDataDir, item)));

  return {
    rootDir,
    appDataDir,
    trackedFiles,
    stagedFiles,
    changedFiles,
    envFiles,
    envKeys: envKeys(rootDir),
    sourceArchiveFiles,
    openClawRuntimeFiles,
    runtimeSections,
    browserRuntimeFiles,
    trackedSecretFiles: filesWithSecretLikeContent(rootDir, trackedFiles.filter(shouldScanTrackedFile))
  };
}

export function buildDeliveryPreflightReport(state) {
  const errors = [];
  const warnings = [];
  const ok = [];

  const trackedPrivateEnv = state.trackedFiles.filter(isPrivateEnvFile);
  if (trackedPrivateEnv.length) {
    errors.push(`Private env files are tracked by Git: ${trackedPrivateEnv.join(", ")}`);
  } else {
    ok.push("Only .env.example may be tracked; private .env files are not tracked.");
  }

  const stagedPrivateEnv = state.stagedFiles.filter(isPrivateEnvFile);
  if (stagedPrivateEnv.length) errors.push(`Private env files are staged: ${stagedPrivateEnv.join(", ")}`);

  const stagedPrivateSource = state.stagedFiles.filter(isPrivateSourcePath);
  if (stagedPrivateSource.length) {
    errors.push(`Private runtime/build paths are staged: ${stagedPrivateSource.join(", ")}`);
  } else {
    ok.push("No staged data/output/build artifacts.");
  }

  if (state.trackedSecretFiles.length) {
    errors.push(`Secret-like values found in tracked source files: ${state.trackedSecretFiles.join(", ")}`);
  } else {
    ok.push("No secret-like values found in tracked source files.");
  }

  const changedRuntime = state.changedFiles.filter(isRuntimePath);
  if (changedRuntime.length) {
    warnings.push(`Local runtime data is modified and must not be shared as a workspace zip: ${summarize(changedRuntime)}`);
  } else {
    ok.push("No modified local data/output runtime files in the worktree.");
  }

  if (state.envFiles.length) {
    warnings.push(`Local private env file exists: ${state.envFiles.join(", ")}. Share key names only, never values.`);
  } else {
    ok.push("No local private env file found in the repository root.");
  }

  if (state.envKeys.length) {
    ok.push(`Local .env key names detected for private restore notes: ${state.envKeys.join(", ")}.`);
  }

  if (state.runtimeSections.length) {
    warnings.push(`Desktop runtime data exists under ${state.appDataDir}: ${state.runtimeSections.join(", ")}. This is private-only.`);
  }

  if (state.browserRuntimeFiles.length) {
    warnings.push(`Electron browser/session files exist under appData: ${state.browserRuntimeFiles.join(", ")}. Do not include them in source packages.`);
  }

  if (state.openClawRuntimeFiles.length) {
    warnings.push(`OpenClaw runtime reports/data are local-only: ${summarize(state.openClawRuntimeFiles)}.`);
  } else {
    ok.push("No OpenClaw runtime report files found in the repository worktree.");
  }

  if (state.trackedFiles.includes("config/openclaw-source-hunters.json")) {
    ok.push("OpenClaw hunter topology config is tracked source; API keys stay in .env.");
  }

  if (state.sourceArchiveFiles.length) {
    warnings.push(`Local archive files exist in the repository root: ${state.sourceArchiveFiles.join(", ")}. Do not forward them without rebuilding/verifying.`);
  }

  ok.push("Safe external handoff should use the GitHub source branch or a no-runtime source archive, not the current workspace folder.");
  return { ok, warnings, errors };
}

export function printDeliveryPreflightReport(report) {
  console.log("AI Creator OS delivery preflight");
  printSection("OK", report.ok);
  printSection("Warnings", report.warnings);
  printSection("Errors", report.errors, console.error);
  if (!report.errors.length) console.log("\nNo critical delivery boundary issues found.");
}

export function isPrivateEnvFile(filePath) {
  return filePath === ".env" || (/^\.env\./.test(filePath) && filePath !== ".env.example");
}

function shouldScanTrackedFile(filePath) {
  if (filePath === ".env.example") return false;
  if (filePath.startsWith("tests/")) return false;
  if (filePath.startsWith("docs/")) return false;
  if (/\.(?:mjs|js|html|css)$/i.test(filePath)) return false;
  if (/\.(?:png|jpg|jpeg|gif|ico|icns|zip|gz|dmg|exe|app)$/i.test(filePath)) return false;
  return !filePath.startsWith("node_modules/");
}

function isPrivateSourcePath(filePath) {
  return isPrivateEnvFile(filePath)
    || privateSourceDirs.some((prefix) => filePath.startsWith(prefix))
    || filePath === "db/seed/from-json.sql";
}

function isRuntimePath(filePath) {
  return filePath.startsWith("data/") || filePath.startsWith("output/") || filePath === "db/seed/from-json.sql";
}

function filesWithSecretLikeContent(rootDir, files) {
  const matches = [];
  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    const text = readFileSync(absolutePath, "utf8");
    if (looksLikeSecret(text)) matches.push(file);
  }
  return matches;
}

function looksLikeSecret(text) {
  return /["']?(?:xAccessToken|xRefreshToken|accessToken|refreshToken|apiKey|clientSecret|secret|x[_-]?(?:access|refresh)?[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["']?(?!YOUR_|REPLACE_|example|demo|mock|test|null|false|true|process\.env|config\.|credential\.|oauthConfig\.)[A-Za-z0-9_./+=:-]{16,}/i.test(text)
    || /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i.test(text);
}

function existingOpenClawRuntimeFiles(rootDir) {
  const files = [];
  const latest = "data/openclaw-source-hunter-latest.json";
  if (existsSync(path.join(rootDir, latest))) files.push(latest);
  const outputDir = path.join(rootDir, "output");
  if (!existsSync(outputDir)) return files;
  for (const file of readdirSync(outputDir)) {
    if (/openclaw/i.test(file)) files.push(`output/${file}`);
  }
  return files;
}

function envKeys(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return [];
  const keys = [];
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    keys.push(trimmed.split("=")[0].trim());
  }
  return [...new Set(keys)].sort();
}

function topLevelFiles(rootDir) {
  return readdirSync(rootDir).filter((file) => {
    const fullPath = path.join(rootDir, file);
    return existsSync(fullPath) && statSync(fullPath).isFile();
  });
}

function summarize(items, limit = 8) {
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} ... +${items.length - limit} more`;
}

function printSection(title, items, writer = console.log) {
  if (!items.length) return;
  writer(`\n${title}:`);
  for (const item of items) writer(`- ${item}`);
}

function parseStatusPath(line) {
  const rawPath = line.slice(3).trim();
  if (!rawPath) return "";
  const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
  return renamedPath.replace(/^"|"$/g, "");
}

function git(args, rootDir, options = {}) {
  const output = execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
  return output.split("\n")
    .map((line) => options.trimLines === false ? line : line.trim())
    .filter(Boolean);
}
