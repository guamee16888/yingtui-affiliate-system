import { BrowserWindow } from "electron";
import { buildIncognitoAccountWindowConfig } from "../scripts/lib/desktop-browser-launcher.mjs";
import { recordDesktopWindowOpen } from "../scripts/lib/desktop-data-store.mjs";

const accountWindows = new Set();

export async function openIncognitoAccountWindow(input = {}) {
  const config = buildIncognitoAccountWindowConfig(input);
  await recordDesktopWindowOpen({
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    handle: input.handle,
    url: config.url
  });
  const window = new BrowserWindow({
    ...config.browserWindowOptions,
    title: `${config.title} · ${config.notice}`
  });
  accountWindows.add(window);
  window.on("closed", () => {
    accountWindows.delete(window);
  });
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(`${config.title} · ${config.notice}`);
  });
  window.loadURL(config.url);
  return {
    ok: true,
    url: config.url,
    partition: config.browserWindowOptions.webPreferences.partition,
    title: config.title,
    notice: config.notice
  };
}

export function closeAllIncognitoAccountWindows() {
  for (const window of [...accountWindows]) {
    if (!window.isDestroyed()) window.close();
  }
  accountWindows.clear();
}
