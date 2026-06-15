import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const warnings = [];
const errors = [];

const statusLines = git(["status", "--porcelain=v1"]).split("\n").filter(Boolean);
const trackedFiles = git(["ls-files"]).split("\n").filter(Boolean);
const stagedFiles = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
const stagedDiff = git(["diff", "--cached", "--unified=0", "--no-ext-diff", "--text"]);

checkRuntimeDataStatus(statusLines);
checkTrackedFiles(trackedFiles);
checkStagedFiles(stagedFiles);
checkStagedDiff(stagedDiff);

printReport();
if (errors.length) process.exitCode = 1;

function checkRuntimeDataStatus(lines) {
  for (const line of lines) {
    const filePath = parseStatusPath(line);
    if (!filePath) continue;
    if (/^output\/[^/]+\.md$/i.test(filePath)) {
      warnings.push(`Local output markdown changed: ${filePath}`);
    }
    if (filePath === "data/latest.json") {
      warnings.push("Local runtime data changed: data/latest.json");
    }
    if (filePath.startsWith("data/daily/")) {
      warnings.push(`Local daily data changed: ${filePath}`);
    }
  }
}

function checkTrackedFiles(files) {
  if (files.some((file) => file === ".env" || /^\.env\./.test(file))) {
    errors.push("Environment file is tracked by Git. Remove it from Git before committing.");
  }
  if (files.includes("db/seed/from-json.sql")) {
    warnings.push("db/seed/from-json.sql is tracked. This file should stay local when exported from JSON.");
  }
  if (files.some((file) => file.startsWith(".wrangler/"))) {
    warnings.push(".wrangler/ files are tracked. Local Cloudflare state should stay out of Git.");
  }
  if (files.some((file) => file.startsWith("dist/"))) {
    warnings.push("dist/ files are tracked. Build output should stay out of Git.");
  }
  if (files.some((file) => file.startsWith("dist-desktop/"))) {
    errors.push("dist-desktop files are tracked. Desktop build output must stay out of Git.");
  }
  if (files.some((file) => file.startsWith("release/"))) {
    errors.push("release files are tracked. Desktop release output must stay out of Git.");
  }
}

function checkStagedFiles(files) {
  for (const file of files) {
    if (file === ".env" || /^\.env\./.test(file)) {
      errors.push(`Staged environment file: ${file}`);
    }
  }
}

function checkStagedDiff(diff) {
  for (const entry of addedLines(diff)) {
    if (looksLikeSecret(entry.line)) {
      errors.push(`Possible token, secret, API key, or bearer credential in staged diff: ${entry.file}`);
    }
    if (looksLikePostedUrl(entry.line)) {
      errors.push(`Real posted X URL or postedUrl found in staged diff: ${entry.file}`);
    }
    if (looksLikeAffiliateLink(entry.line)) {
      errors.push(`Real affiliate link found in staged diff: ${entry.file}`);
    }
    if (looksLikePublicHandle(entry.file, entry.line)) {
      warnings.push(`Possible real X handle in public-facing staged diff: ${entry.file}`);
    }
    if (entry.file.startsWith("dist-desktop/")) {
      errors.push(`Desktop build artifact staged: ${entry.file}`);
    }
    if (entry.file.startsWith("release/")) {
      errors.push(`Desktop release artifact staged: ${entry.file}`);
    }
  }
}

function addedLines(diff) {
  const lines = [];
  let currentFile = "(unknown)";
  for (const rawLine of diff.split("\n")) {
    if (rawLine.startsWith("+++ b/")) {
      currentFile = rawLine.slice(6);
      continue;
    }
    if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;
    lines.push({ file: currentFile, line: rawLine.slice(1) });
  }
  return lines;
}

function looksLikeSecret(line) {
  const assignment = /\b(?:x[_-]?(?:access|refresh)?[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|secret)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{16,}/i;
  const bearer = /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i;
  return assignment.test(line) || bearer.test(line);
}

function looksLikePostedUrl(line) {
  return /"postedUrl"\s*:\s*"https?:\/\//i.test(line)
    || /\bhttps?:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]{3,15}\/status\/\d{5,}\b/i.test(line);
}

function looksLikeAffiliateLink(line) {
  return /"affiliate(?:Link|Url)"\s*:\s*"https?:\/\/(?!example\.com|localhost|127\.0\.0\.1)/i.test(line)
    || /\baffiliate\s+(?:link|url)\b.*https?:\/\/(?!example\.com|localhost|127\.0\.0\.1)/i.test(line);
}

function looksLikePublicHandle(filePath, line) {
  const publicPath = /^(public\/|manager\/|app-placeholder\/|README\.md|docs\/deployment\/public-demo\.md)/.test(filePath);
  if (!publicPath) return false;
  return /"handle"\s*:\s*"@?[A-Za-z0-9_]{3,15}"/i.test(line)
    || /\bhttps?:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]{3,15}\b/i.test(line);
}

function parseStatusPath(line) {
  const rawPath = line.slice(3).trim();
  if (!rawPath) return "";
  const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
  return renamedPath.replace(/^"|"$/g, "");
}

function printReport() {
  console.log("Git safety check");
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const warning of unique(warnings)) console.log(`- ${warning}`);
  }
  if (errors.length) {
    console.error("\nErrors:");
    for (const error of unique(errors)) console.error(`- ${error}`);
    return;
  }
  console.log("\nNo critical Git safety issues found.");
}

function unique(items) {
  return [...new Set(items)];
}

function git(args) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
