export const DEFAULT_APP_STORAGE_MODE = "json";
export const APP_STORAGE_MODES = new Set(["json", "d1"]);

export function getAppStorageMode(env = process.env) {
  const value = String(env.APP_STORAGE_MODE || DEFAULT_APP_STORAGE_MODE).trim().toLowerCase();
  if (!APP_STORAGE_MODES.has(value)) {
    throw new Error(`Unsupported APP_STORAGE_MODE: ${value}. Use "json" or "d1".`);
  }
  return value;
}

export function assertJsonStorageMode(env = process.env) {
  const mode = getAppStorageMode(env);
  if (mode !== "json") {
    throw new Error("APP_STORAGE_MODE=d1 is reserved for the app.guamee.org D1 MVP. This local static server has no D1 binding yet.");
  }
  return mode;
}
