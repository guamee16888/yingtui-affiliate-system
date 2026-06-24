import * as desktopAppDataStorage from "./adapters/desktop-app-data.mjs";
import * as jsonFileStorage from "./adapters/json-file.mjs";

export * from "./adapters/json-file.mjs";
export * from "./adapters/desktop-app-data.mjs";

export const storageAdapters = {
  jsonFile: jsonFileStorage,
  desktopAppData: desktopAppDataStorage
};

export function getStorageAdapter(mode = "json") {
  if (mode === "desktop" || mode === "desktopAppData") return desktopAppDataStorage;
  return jsonFileStorage;
}
