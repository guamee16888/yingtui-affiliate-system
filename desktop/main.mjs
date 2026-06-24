import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDesktopDataDir, findDesktopPort } from "./app-config.mjs";
import {
  openIncognitoAccountWindow,
  openPersistentAccountWindow,
  closeAllIncognitoAccountWindows
} from "./browser-window-manager.mjs";
import { installDesktopMenu } from "./menu.mjs";
import { buildDesktopManagerUrl, resolveDesktopLoadUrl } from "./runtime-url.mjs";
import { appendDesktopLog, exportDesktopBackupPackage } from "../scripts/lib/storage/interface.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
let backendServer = null;
let desktopInfo = null;
let mainWindow = null;

app.setName("AI Creator OS");

app.whenReady().then(async () => {
  const { appDataDir, dataDir } = await ensureDesktopDataDir();
  process.env.APP_STORAGE_MODE = "json";
  process.env.AI_CREATOR_OS_DESKTOP = "1";
  process.env.AI_CREATOR_OS_DATA_DIR = appDataDir;
  let managerUrl = resolveDesktopLoadUrl(process.env);
  let port = Number(new URL(managerUrl).port || process.env.AI_CREATOR_OS_DESKTOP_PORT || 5288);

  if (!process.env.AI_CREATOR_OS_DESKTOP_URL) {
    port = await startEmbeddedBackend({ appDataDir });
    managerUrl = buildDesktopManagerUrl({ host, port });
  }
  desktopInfo = { appDataDir, dataDir, host, port, url: managerUrl };
  await appendDesktopLog({
    type: "desktop.app.start",
    summary: "AI Creator OS Desktop started.",
    metadata: { appDataDir, port }
  });

  installDesktopMenu({ dataDir: appDataDir });
  registerIpcHandlers();
  await openMainWindow(managerUrl);
}).catch((error) => {
  console.error(`AI Creator OS Desktop failed to start: ${error.message}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await openMainWindow(resolveDesktopLoadUrl(process.env));
  }
});

app.on("before-quit", () => {
  closeAllIncognitoAccountWindows();
  backendServer?.close?.();
});

async function startEmbeddedBackend({ appDataDir }) {
  const port = await findDesktopPort({ host });
  process.env.AI_CREATOR_OS_DESKTOP_PORT = String(port);
  process.env.AI_CREATOR_OS_DATA_DIR = appDataDir;
  const { startDashboardServer } = await import("../scripts/ops/serve-dashboard.mjs");
  backendServer = startDashboardServer({
    host,
    port,
    silent: true,
    desktopHandlers: { openIncognitoAccountWindow, openPersistentAccountWindow }
  });
  await appendDesktopLog({
    type: "desktop.backend.start",
    summary: "Embedded desktop backend started.",
    metadata: { host, port, appDataDir }
  });
  console.log(`AI Creator OS Desktop backend running at http://${host}:${port}`);
  return port;
}

async function openMainWindow(managerUrl) {
  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    const message = `AI Creator OS Desktop failed to load local backend.\n${errorCode}: ${errorDescription}\n${validatedUrl}`;
    console.error(message);
    mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(message))}`);
  });
  console.log(`Electron loading ${managerUrl}`);
  try {
    await mainWindow.loadURL(managerUrl);
  } catch (error) {
    const message = `AI Creator OS Desktop failed to load local backend.\n${error.message}`;
    console.error(message);
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(message))}`);
  }
}

function createMainWindow() {
  return new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1040,
    minHeight: 720,
    title: "AI Creator OS Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
}

function errorPage(message) {
  return `<!doctype html>
<meta charset="utf-8">
<title>AI Creator OS Desktop</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; line-height: 1.5; color: #17202a; }
  pre { white-space: pre-wrap; background: #f5f7f8; border: 1px solid #dce3e8; border-radius: 10px; padding: 16px; }
</style>
<h1>AI Creator OS Desktop failed to load local backend.</h1>
<pre>${escapeHtml(message)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function registerIpcHandlers() {
  ipcMain.handle("account-window:open-incognito", (_event, input) => openIncognitoAccountWindow(input));
  ipcMain.handle("account-window:open-persistent", (_event, input) => openPersistentAccountWindow(input));
  ipcMain.handle("desktop:open-external-url", async (_event, url) => {
    const parsed = new URL(String(url || ""));
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs can be opened.");
    await shell.openExternal(parsed.toString());
    return { ok: true, url: parsed.toString() };
  });
  ipcMain.handle("desktop:open-data-directory", async () => {
    const target = desktopInfo?.appDataDir || app.getPath("userData");
    await shell.openPath(target);
    return { ok: true, path: target };
  });
  ipcMain.handle("desktop:open-logs-directory", async () => {
    const target = path.join(desktopInfo?.appDataDir || app.getPath("userData"), "logs");
    await shell.openPath(target);
    return { ok: true, path: target };
  });
  ipcMain.handle("desktop:export-backup", async () => {
    const backup = await exportDesktopBackupPackage({ appDataDir: desktopInfo?.appDataDir });
    return { ok: true, path: backup.path, files: backup.files };
  });
  ipcMain.handle("desktop:info", () => ({ ok: true, ...desktopInfo }));
}
