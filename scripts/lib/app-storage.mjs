import { getAppStorageMode } from "./app-storage-mode.mjs";
import { createD1StorageAdapter } from "./d1-storage-adapter.mjs";
import jsonStorageAdapter from "./json-storage-adapter.mjs";

export function getAppStorage(options = {}) {
  const env = options.env || process.env;
  const mode = getAppStorageMode(env);
  if (mode === "json") return jsonStorageAdapter;

  const d1Binding = options.d1Binding || options.db || options.env?.AI_CREATOR_OS_D1;
  if (!d1Binding) {
    throw new Error("APP_STORAGE_MODE=d1 requires a D1 binding. Use APP_STORAGE_MODE=json for the local Node server.");
  }
  return createD1StorageAdapter(d1Binding);
}
