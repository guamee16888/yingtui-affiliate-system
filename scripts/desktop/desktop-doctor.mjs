import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canListen, DEFAULT_DESKTOP_PORT, ensureDesktopDataDir, findDesktopPort, repoRoot } from "../../desktop/app-config.mjs";
import { checkDesktopHealth } from "./desktop-health-check.mjs";

export const DESKTOP_DOCTOR_REQUIRED_FILES = [
  "desktop/main.mjs",
  "desktop/preload.mjs",
  "desktop/browser-window-manager.mjs",
  "scripts/desktop/desktop-dev.mjs",
  "scripts/desktop/desktop-health-check.mjs",
  "manager/index.html"
];

export async function collectDesktopDoctorChecks({ cwd = process.cwd(), startTemporaryBackend = true } = {}) {
  const checks = [];
  const add = (level, message) => checks.push({ level, message });
  const pass = (message) => add("PASS", message);
  const warn = (message) => add("WARN", message);
  const error = (message) => add("ERROR", message);

  if (path.resolve(cwd) === repoRoot) pass(`Current path: ${cwd}`);
  else error(`Run from the AI Creator OS project root. Current path: ${cwd}`);

  try {
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim();
    if (branch === "feature/desktop-app-v1") pass(`Branch: ${branch}`);
    else warn(`Branch is ${branch || "(unknown)"}, expected feature/desktop-app-v1`);
  } catch (err) {
    error(`Could not read git branch: ${err.message}`);
  }

  pass(`Node: ${process.version}`);
  try {
    const npmVersion = execFileSync("npm", ["-v"], { cwd, encoding: "utf8" }).trim();
    pass(`npm: ${npmVersion}`);
  } catch (err) {
    error(`npm unavailable: ${err.message}`);
  }

  try {
    await readFile(path.join(cwd, "node_modules", "electron", "package.json"), "utf8");
    pass("Electron package installed");
  } catch {
    error("Electron package missing. Run npm install.");
  }

  for (const file of DESKTOP_DOCTOR_REQUIRED_FILES) {
    try {
      await readFile(path.join(cwd, file), "utf8");
      pass(`File exists: ${file}`);
    } catch {
      error(`Missing file: ${file}`);
    }
  }

  if (await canListen(DEFAULT_DESKTOP_PORT)) {
    pass("Port 5288 is available");
  } else {
    const nextPort = await findDesktopPort({ startPort: DEFAULT_DESKTOP_PORT });
    warn(`Port 5288 is in use; desktop dev can switch to ${nextPort}`);
  }

  try {
    const { appDataDir } = await ensureDesktopDataDir();
    const probePath = path.join(appDataDir, ".desktop-doctor-write-test");
    await writeFile(probePath, new Date().toISOString(), "utf8");
    await rm(probePath, { force: true });
    pass(`Desktop data directory is writable: ${appDataDir}`);
    if (path.resolve(appDataDir).startsWith(path.join(repoRoot, "data"))) {
      error("Desktop data directory points inside repo data.");
    } else {
      pass("Desktop data directory is outside repo data");
    }
  } catch (err) {
    error(`Desktop data directory is not writable: ${err.message}`);
  }

  const packageJson = await readJsonSafe(path.join(cwd, "package.json"));
  for (const script of ["build:public", "release:check:public", "build:admin-demo", "release:check:admin", "build:app", "release:check:app"]) {
    if (packageJson.scripts?.[script]) pass(`Build boundary script exists: ${script}`);
    else error(`Missing build boundary script: ${script}`);
  }

  if (startTemporaryBackend) {
    await checkTemporaryHealth({ pass, error });
  }

  return {
    checks,
    ok: !checks.some((check) => check.level === "ERROR")
  };
}

async function checkTemporaryHealth({ pass, error }) {
  let server = null;
  const previousEnv = {
    APP_STORAGE_MODE: process.env.APP_STORAGE_MODE,
    AI_CREATOR_OS_DESKTOP: process.env.AI_CREATOR_OS_DESKTOP,
    AI_CREATOR_OS_DESKTOP_PORT: process.env.AI_CREATOR_OS_DESKTOP_PORT,
    AI_CREATOR_OS_DATA_DIR: process.env.AI_CREATOR_OS_DATA_DIR
  };
  try {
    const { appDataDir } = await ensureDesktopDataDir();
    const port = await findDesktopPort({ startPort: DEFAULT_DESKTOP_PORT });
    process.env.APP_STORAGE_MODE = "json";
    process.env.AI_CREATOR_OS_DESKTOP = "1";
    process.env.AI_CREATOR_OS_DESKTOP_PORT = String(port);
    process.env.AI_CREATOR_OS_DATA_DIR = appDataDir;
    const { startDashboardServer } = await import("./serve-dashboard.mjs");
    server = startDashboardServer({ host: "127.0.0.1", port, silent: true });
    const result = await checkDesktopHealth({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 10_000 });
    if (result.payload?.mode === "desktop" && result.payload?.port === port) {
      pass(`GET /api/desktop/health ok on port ${port}`);
    } else {
      error("GET /api/desktop/health returned unexpected payload.");
    }
  } catch (err) {
    error(`GET /api/desktop/health failed: ${err.message}`);
  } finally {
    await new Promise((resolve) => server?.close ? server.close(resolve) : resolve());
    restoreEnv(previousEnv);
  }
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const result = await collectDesktopDoctorChecks();
  console.log("Desktop doctor");
  for (const check of result.checks) console.log(`${check.level} ${check.message}`);
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
