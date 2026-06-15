import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

export const DEFAULT_DESKTOP_PORT = 5288;
export const RESERVED_WEB_PORTS = new Set([4173, 4174, 4175]);
export const APP_NAME = "AI Creator OS";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export function getDesktopAppDataDir(platform = process.platform, env = process.env) {
  if (env.AI_CREATOR_OS_DATA_DIR) return path.resolve(env.AI_CREATOR_OS_DATA_DIR);
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
}

export async function ensureDesktopDataDir(options = {}) {
  const appDataDir = options.appDataDir || getDesktopAppDataDir(options.platform, options.env || process.env);
  const dataDir = path.join(appDataDir, "data");
  await mkdir(dataDir, { recursive: true });
  await mkdir(path.join(appDataDir, "config"), { recursive: true });
  await mkdir(path.join(appDataDir, "output"), { recursive: true });
  await initializeDemoData({ appDataDir, repoRoot: options.repoRoot || repoRoot });
  return { appDataDir, dataDir };
}

export function getDesktopSeedDataDir(root = repoRoot) {
  return path.join(root, "desktop", "seed-data");
}

export async function findDesktopPort({ host = "127.0.0.1", startPort = DEFAULT_DESKTOP_PORT, maxPort = 5399, onPortBusy = null } = {}) {
  for (let port = startPort; port <= maxPort; port += 1) {
    if (RESERVED_WEB_PORTS.has(port)) continue;
    if (await canListen(port, host)) return port;
    if (typeof onPortBusy === "function") onPortBusy(port);
  }
  throw new Error(`No open desktop port found between ${startPort} and ${maxPort}.`);
}

export async function exportDesktopBackup({ appDataDir, now = new Date() } = {}) {
  const source = appDataDir || getDesktopAppDataDir();
  const backupDir = path.join(source, "backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `ai-creator-os-backup-${stamp}.json`);
  const manifest = {
    version: 1,
    exportedAt: now.toISOString(),
    appDataDir: source,
    note: "First desktop backup manifest. Data files remain in the app data directory."
  };
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return target;
}

async function initializeDemoData({ appDataDir, repoRoot }) {
  const marker = path.join(appDataDir, ".demo-data-initialized");
  try {
    await readFile(marker, "utf8");
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const seedDir = await resolveSeedDataDir(repoRoot);
  if (!seedDir) {
    await writeFile(marker, new Date().toISOString(), "utf8");
    return;
  }
  await cp(seedDir, path.join(appDataDir, "data"), {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: (source) => !source.includes(`${path.sep}backups${path.sep}`) && !source.endsWith(".DS_Store")
  });
  await writeFile(marker, new Date().toISOString(), "utf8");
}

async function resolveSeedDataDir(root) {
  for (const candidate of [getDesktopSeedDataDir(root), path.join(root, "data")]) {
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return "";
}

export function canListen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
