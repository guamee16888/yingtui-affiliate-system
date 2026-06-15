import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DESKTOP_PORT, ensureDesktopDataDir, findDesktopPort, repoRoot } from "../desktop/app-config.mjs";
import { buildDesktopManagerUrl } from "../desktop/runtime-url.mjs";
import { checkDesktopHealth } from "./desktop-health-check.mjs";

const HOST = "127.0.0.1";
export { buildDesktopManagerUrl };

export async function assertDesktopWorktree(cwd = process.cwd()) {
  if (path.basename(cwd) !== "ai-creator-os-desktop") {
    throw new Error(`请在 /Users/dadada/Documents/ai-creator-os-desktop 里运行。当前目录是 ${cwd}`);
  }
  await readFile(path.join(cwd, "desktop", "main.mjs"), "utf8");
  await readFile(path.join(cwd, "package.json"), "utf8");
  return true;
}

export async function resolveElectronBin(cwd = process.cwd()) {
  const packagePath = path.join(cwd, "node_modules", "electron", "package.json");
  await readFile(packagePath, "utf8");
  return path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
}

export async function prepareDesktopRuntime({
  host = HOST,
  startPort = DEFAULT_DESKTOP_PORT,
  cwd = process.cwd(),
  onPortBusy = null
} = {}) {
  await assertDesktopWorktree(cwd);
  const electronBin = await resolveElectronBin(cwd);
  const { appDataDir, dataDir } = await ensureDesktopDataDir();
  const port = await findDesktopPort({
    host,
    startPort,
    onPortBusy
  });
  const baseUrl = `http://${host}:${port}`;
  const managerUrl = buildDesktopManagerUrl({ host, port });
  return { appDataDir, dataDir, electronBin, host, port, baseUrl, managerUrl };
}

async function main() {
  let backendServer = null;
  let electronProcess = null;
  let shuttingDown = false;

  function closeBackend() {
    return new Promise((resolve) => {
      if (!backendServer?.close) {
        resolve();
        return;
      }
      backendServer.close(() => resolve());
    });
  }

  async function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (electronProcess && !electronProcess.killed) electronProcess.kill("SIGTERM");
    await closeBackend();
    process.exit(exitCode);
  }

  process.once("SIGINT", () => shutdown(130));
  process.once("SIGTERM", () => shutdown(143));

  try {
    console.log("AI Creator OS Desktop backend starting...");
    const runtime = await prepareDesktopRuntime({
      onPortBusy: (port) => console.log(`Port ${port} is in use, trying ${port + 1}...`)
    });

    process.env.APP_STORAGE_MODE = "json";
    process.env.AI_CREATOR_OS_DESKTOP = "1";
    process.env.AI_CREATOR_OS_DESKTOP_PORT = String(runtime.port);
    process.env.AI_CREATOR_OS_DATA_DIR = runtime.appDataDir;

    const { startDashboardServer } = await import("./serve-dashboard.mjs");
    backendServer = startDashboardServer({ host: runtime.host, port: runtime.port, silent: true });
    backendServer.once("error", (error) => {
      console.error(`Desktop backend failed: ${error.message}`);
      shutdown(1);
    });
    console.log(`AI Creator OS Desktop backend running at ${runtime.baseUrl}`);

    await checkDesktopHealth({ baseUrl: runtime.baseUrl, timeoutMs: 10_000 });
    console.log("Desktop health check passed.");
    console.log(`Electron loading ${runtime.managerUrl}`);

    electronProcess = spawn(runtime.electronBin, ["desktop/main.mjs"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        APP_STORAGE_MODE: "json",
        AI_CREATOR_OS_DESKTOP: "1",
        AI_CREATOR_OS_DESKTOP_PORT: String(runtime.port),
        AI_CREATOR_OS_DATA_DIR: runtime.appDataDir,
        AI_CREATOR_OS_DESKTOP_URL: runtime.managerUrl
      }
    });
    electronProcess.once("error", (error) => {
      console.error(`Electron failed to start: ${error.message}`);
      shutdown(1);
    });
    electronProcess.once("exit", (code, signal) => {
      if (shuttingDown) return;
      if (signal) console.log(`Electron exited with signal ${signal}`);
      shutdown(code ?? 0);
    });
  } catch (error) {
    console.error(`AI Creator OS Desktop failed to start: ${error.message}`);
    await closeBackend();
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
