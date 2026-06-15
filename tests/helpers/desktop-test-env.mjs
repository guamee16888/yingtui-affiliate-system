import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withDesktopTestEnv(fn) {
  const previous = {
    AI_CREATOR_OS_DATA_DIR: process.env.AI_CREATOR_OS_DATA_DIR,
    AI_CREATOR_OS_DESKTOP: process.env.AI_CREATOR_OS_DESKTOP,
    APP_STORAGE_MODE: process.env.APP_STORAGE_MODE
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-creator-os-desktop-test-"));
  process.env.AI_CREATOR_OS_DATA_DIR = dir;
  process.env.AI_CREATOR_OS_DESKTOP = "1";
  process.env.APP_STORAGE_MODE = "json";
  try {
    return await fn(dir);
  } finally {
    restoreEnv(previous);
    await rm(dir, { recursive: true, force: true });
  }
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
