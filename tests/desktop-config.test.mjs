import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { DEFAULT_DESKTOP_PORT, getDesktopAppDataDir, RESERVED_WEB_PORTS } from "../desktop/app-config.mjs";

test("desktop default port is 5288 and avoids web demo ports", () => {
  assert.equal(DEFAULT_DESKTOP_PORT, 5288);
  assert.equal(RESERVED_WEB_PORTS.has(DEFAULT_DESKTOP_PORT), false);
});

test("desktop data dir is outside repo data on mac and windows", () => {
  const macDir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  const winDir = getDesktopAppDataDir("win32", { APPDATA: "C:\\Users\\example\\AppData\\Roaming" });
  assert.equal(macDir.endsWith(path.join("Library", "Application Support", "AI Creator OS")), true);
  assert.match(winDir, /AI Creator OS$/);
  assert.equal(macDir.includes(`${path.sep}Documents${path.sep}`), false);
});
