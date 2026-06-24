import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceApp = path.join(repoRoot, "dist-desktop", "mac-arm64", "AI Creator OS.app");
const applicationsDir = "/Applications";
const targetApp = path.join(applicationsDir, "AI Creator OS.app");

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  await ensureSourceApp();
  await quitRunningApp();
  const removed = await removeOldApps();
  await run("ditto", [sourceApp, targetApp]);
  await run("xattr", ["-dr", "com.apple.quarantine", targetApp], { optional: true });
  await run("killall", ["Dock"], { optional: true });
  if (!process.argv.includes("--no-open")) await run("open", ["-a", targetApp]);

  console.log("Installed current AI Creator OS app.");
  console.log(`Source: ${sourceApp}`);
  console.log(`Target: ${targetApp}`);
  console.log(`Removed old app bundles: ${removed.length}`);
  for (const item of removed) console.log(`- ${item}`);
}

async function ensureSourceApp() {
  try {
    const entries = await readdir(sourceApp);
    if (!entries.length) throw new Error("empty app bundle");
  } catch {
    throw new Error("Packaged app not found. Run npm run desktop:pack:dir first.");
  }
}

async function quitRunningApp() {
  await run("osascript", ["-e", 'tell application "AI Creator OS" to quit'], { optional: true });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await run("pkill", ["-f", "/Applications/AI Creator OS.app/Contents/MacOS/AI Creator OS"], { optional: true });
}

async function removeOldApps() {
  const removed = [];
  const entries = await readdir(applicationsDir);
  for (const entry of entries) {
    if (entry === "AI Creator OS.app" || /^AI Creator OS\.app\.bak-\d+$/.test(entry)) {
      const fullPath = path.join(applicationsDir, entry);
      await rm(fullPath, { recursive: true, force: true });
      removed.push(fullPath);
    }
  }
  return removed;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      if (options.optional) resolve();
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0 || options.optional) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
