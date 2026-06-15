import assert from "node:assert/strict";
import test from "node:test";
import { getDesktopAppDataDir, getDesktopSeedDataDir, RESERVED_WEB_PORTS } from "../desktop/app-config.mjs";

test("packaged runtime uses desktop seed data instead of repo runtime data", () => {
  const seedDir = getDesktopSeedDataDir("/tmp/app.asar");
  assert.equal(seedDir, "/tmp/app.asar/desktop/seed-data");
  assert.equal(seedDir.includes("/data/latest.json"), false);
});

test("packaged runtime does not depend on web demo ports", () => {
  for (const port of [4173, 4174, 4175]) {
    assert.equal(RESERVED_WEB_PORTS.has(port), true);
  }
  assert.equal(RESERVED_WEB_PORTS.has(5288), false);
});

test("packaged runtime writes data to appData, not repo data", () => {
  const macDir = getDesktopAppDataDir("darwin", { HOME: "/Users/example" });
  const winDir = getDesktopAppDataDir("win32", { APPDATA: "C:\\Users\\example\\AppData\\Roaming" });
  assert.match(macDir, /Library\/Application Support\/AI Creator OS$/);
  assert.match(winDir, /AI Creator OS$/);
  assert.equal(macDir.includes("/Documents/ai-creator-os-desktop/data"), false);
});
