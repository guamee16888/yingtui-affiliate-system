import { BrowserWindow, session } from "electron";
import {
  buildIncognitoAccountWindowConfig,
  buildPersistentAccountWindowConfig
} from "../scripts/lib/desktop-browser-launcher.mjs";
import { recordDesktopWindowOpen } from "../scripts/lib/storage/interface.mjs";

const accountWindows = new Set();

export function openIncognitoAccountWindow(input = {}) {
  const config = buildIncognitoAccountWindowConfig(input);
  return openAccountWindow(input, config, "temp");
}

export function openPersistentAccountWindow(input = {}) {
  const config = buildPersistentAccountWindowConfig(input);
  return openAccountWindow(input, config, "persistent");
}

async function openAccountWindow(input, config, windowMode) {
  await recordDesktopWindowOpen({
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    handle: input.handle,
    url: config.url,
    windowMode
  });

  const proxyUrl = input.proxyUrl || "";
  const partition = config.browserWindowOptions.webPreferences.partition;

  const win = new BrowserWindow({
    ...config.browserWindowOptions,
    title: `${config.title} · ${config.notice}`
  });
  accountWindows.add(win);
  win.on("closed", () => {
    accountWindows.delete(win);
  });
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(`${config.title} · ${config.notice}`);
  });

  // 固定窗口：在 loadURL 之前设置代理
  if (proxyUrl && windowMode === "persistent") {
    try {
      const ses = partition ? session.fromPartition(partition) : session.defaultSession;
      await ses.setProxy({ proxyRules: proxyUrl });
      console.log(`[proxy] Proxy set for partition "${partition}": ${proxyUrl}`);
    } catch (error) {
      console.error(`[proxy] Failed to set proxy: ${error.message}`);
    }
  }

  win.loadURL(config.url);
  return {
    ok: true,
    url: config.url,
    partition,
    proxyUrl,
    title: config.title,
    notice: config.notice
  };
}

export function closeAllIncognitoAccountWindows() {
  for (const win of [...accountWindows]) {
    if (!win.isDestroyed()) win.close();
  }
  accountWindows.clear();
}
