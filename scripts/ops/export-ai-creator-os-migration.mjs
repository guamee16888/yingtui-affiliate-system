import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const appDataDir = path.join(os.homedir(), "Library", "Application Support", "AI Creator OS");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupRoot = path.resolve(process.argv[2] || path.join(os.homedir(), "Guamee", "backups", "ai-creator-os", stamp));

await mkdir(backupRoot, { recursive: true });

const gitStatus = run("git", ["status", "--short"]);
const gitInfo = [
  `repoRoot=${repoRoot}`,
  `exportedAt=${new Date().toISOString()}`,
  `branch=${run("git", ["branch", "--show-current"]).trim()}`,
  "",
  "remotes:",
  run("git", ["remote", "-v"]).trim(),
  "",
  "last commits:",
  run("git", ["log", "--oneline", "-5"]).trim(),
  "",
  "status:",
  gitStatus.trim() || "(clean)"
].join("\n");

await writeFile(path.join(backupRoot, "git-info.txt"), `${gitInfo}\n`, "utf8");
await writeFile(path.join(backupRoot, "git-status.txt"), `${gitStatus}`, "utf8");

const codeDiff = run("git", [
  "diff",
  "--binary",
  "--",
  ".",
  ":(exclude)data/**",
  ":(exclude)output/**",
  ":(exclude)dist/**",
  ":(exclude)dist-desktop/**"
], { allowFailure: true });
await writeFile(path.join(backupRoot, "uncommitted-code.patch"), codeDiff, "utf8");

const untracked = run("git", ["ls-files", "--others", "--exclude-standard"])
  .split("\n")
  .map((item) => item.trim())
  .filter(Boolean)
  .filter(shouldIncludeUntracked);
await writeFile(path.join(backupRoot, "untracked-files.txt"), `${untracked.join("\n")}\n`, "utf8");
if (untracked.length) {
  await writeFile(path.join(backupRoot, ".untracked-tar-list"), `${untracked.join("\n")}\n`, "utf8");
  run("tar", ["-czf", path.join(backupRoot, "untracked-files.tar.gz"), "-T", path.join(backupRoot, ".untracked-tar-list")]);
}

await writeFile(path.join(backupRoot, ".env.keys.txt"), await envKeysText(), "utf8");

if (existsSync(appDataDir)) {
  const runtimeItems = ["data", "config", "output", "logs"].filter((item) => existsSync(path.join(appDataDir, item)));
  if (runtimeItems.length) {
    run("tar", ["-czf", path.join(backupRoot, "desktop-runtime-data.tar.gz"), "-C", appDataDir, ...runtimeItems]);
  }
}

await writeFile(path.join(backupRoot, "README-RESTORE.md"), restoreGuide(), "utf8");

console.log(`AI Creator OS migration export created: ${backupRoot}`);
console.log("Files:");
for (const file of [
  "README-RESTORE.md",
  "git-info.txt",
  "git-status.txt",
  "uncommitted-code.patch",
  "untracked-files.txt",
  "untracked-files.tar.gz",
  "desktop-runtime-data.tar.gz",
  ".env.keys.txt"
]) {
  if (existsSync(path.join(backupRoot, file))) console.log(`- ${file}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout || "";
}

function shouldIncludeUntracked(filePath) {
  const blocked = [
    ".env",
    ".env.",
    "node_modules/",
    "dist/",
    "dist-desktop/",
    "release/",
    "release-local/",
    ".vercel/",
    ".wrangler/",
    "data/",
    "output/",
    "data/backups/"
  ];
  return !blocked.some((prefix) => filePath === prefix.replace(/\/$/, "") || filePath.startsWith(prefix));
}

async function envKeysText() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return "No .env file found in the old checkout.\n";
  const text = await readFile(envPath, "utf8");
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    keys.push(trimmed.split("=")[0].trim());
  }
  return [
    "# Secret values are intentionally not exported.",
    "# Recreate these on the new Mac from your password manager or provider consoles.",
    ...keys
  ].join("\n") + "\n";
}

function restoreGuide() {
  return `# AI Creator OS New Mac Restore

This package was exported from:

\`\`\`text
${repoRoot}
\`\`\`

## 1. Clone the repository

\`\`\`bash
mkdir -p ~/Guamee/projects
git clone https://github.com/guamee16888/yingtui-affiliate-system.git ~/Guamee/projects/ai-creator-os
cd ~/Guamee/projects/ai-creator-os
\`\`\`

## 2. Restore the current local code

\`\`\`bash
git apply --3way /path/to/this-package/uncommitted-code.patch
tar -xzf /path/to/this-package/untracked-files.tar.gz -C ~/Guamee/projects/ai-creator-os
npm install
npm run check
npm test
\`\`\`

After this step, \`setup/bootstrap-ai-creator-os.sh\` exists in the checkout and can be used for future new-Mac rebuilds after it is committed and pushed.

## 3. Restore desktop runtime data

Quit AI Creator OS first, then restore:

\`\`\`bash
osascript -e 'quit app "AI Creator OS"' || true
mkdir -p "$HOME/Library/Application Support/AI Creator OS"
tar -xzf /path/to/this-package/desktop-runtime-data.tar.gz -C "$HOME/Library/Application Support/AI Creator OS"
\`\`\`

This runtime archive includes local JSON/config/output/logs. It intentionally does not include Electron browser Cookie files.

## 4. Restore secrets

Secret values are not included. Check \`.env.keys.txt\` in this package and recreate \`.env\` from your password manager or provider consoles.

## 5. Rebuild the Mac app

\`\`\`bash
npm run desktop:pack:dir
npm run desktop:install:mac
open -n "/Applications/AI Creator OS.app"
\`\`\`

## 6. Verify

\`\`\`bash
curl http://127.0.0.1:5288/api/desktop/health
npm run check
npm test
\`\`\`
`;
}
