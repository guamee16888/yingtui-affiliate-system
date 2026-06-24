import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenClawLaunchdPlist, OPENCLAW_LAUNCHD_LABEL } from "./lib/openclaw-scheduler.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const launchAgentsDir = path.join(homedir(), "Library", "LaunchAgents");
const plistPath = path.join(launchAgentsDir, `${OPENCLAW_LAUNCHD_LABEL}.plist`);
const domain = `gui/${process.getuid()}`;
const service = `${domain}/${OPENCLAW_LAUNCHD_LABEL}`;

if (args.uninstall) {
  await run("launchctl", ["bootout", domain, plistPath], { optional: true });
  await rm(plistPath, { force: true });
  console.log(`Removed OpenClaw scheduler: ${plistPath}`);
  process.exit(0);
}

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(path.join(repoRoot, "output"), { recursive: true });
const plist = buildOpenClawLaunchdPlist({
  projectRoot: repoRoot,
  nodePath: process.execPath,
  hour: args.hour,
  minute: args.minute
});
await writeFile(plistPath, plist, "utf8");

await run("launchctl", ["bootout", domain, plistPath], { optional: true });
await run("launchctl", ["bootstrap", domain, plistPath]);
await run("launchctl", ["enable", service], { optional: true });
if (args.runNow) await run("launchctl", ["kickstart", "-k", service], { optional: true });

console.log("Installed OpenClaw daily scheduler.");
console.log(`- Label: ${OPENCLAW_LAUNCHD_LABEL}`);
console.log(`- Time: ${String(args.hour).padStart(2, "0")}:${String(args.minute).padStart(2, "0")}`);
console.log(`- Plist: ${plistPath}`);
console.log(`- Logs: ${path.join(repoRoot, "output", "openclaw-daily.out.log")}`);

function parseArgs(argv) {
  const parsed = {
    hour: 8,
    minute: 10,
    runNow: false,
    uninstall: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--hour") parsed.hour = Number(argv[++index] || parsed.hour);
    else if (arg === "--minute") parsed.minute = Number(argv[++index] || parsed.minute);
    else if (arg === "--run-now") parsed.runNow = true;
    else if (arg === "--uninstall") parsed.uninstall = true;
  }
  return parsed;
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (options.optional) resolve();
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0 || options.optional) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}
