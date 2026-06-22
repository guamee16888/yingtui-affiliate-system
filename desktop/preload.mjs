import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aiCreatorOS", {
  desktop: true,
  openIncognitoAccountWindow(input) {
    return ipcRenderer.invoke("account-window:open-incognito", input);
  },
  openPersistentAccountWindow(input) {
    return ipcRenderer.invoke("account-window:open-persistent", input);
  },
  openExternalUrl(url) {
    return ipcRenderer.invoke("desktop:open-external-url", url);
  },
  openDataDirectory() {
    return ipcRenderer.invoke("desktop:open-data-directory");
  },
  openLogsDirectory() {
    return ipcRenderer.invoke("desktop:open-logs-directory");
  },
  exportBackup() {
    return ipcRenderer.invoke("desktop:export-backup");
  },
  getDesktopInfo() {
    return ipcRenderer.invoke("desktop:info");
  }
});
