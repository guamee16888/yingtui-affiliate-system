import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { readPngInfo } from "../scripts/desktop-mac-trial-smoke.mjs";

test("mac icon assets exist and icon.png is at least 1024", async () => {
  await access("assets/icon.png");
  await access("assets/icon.icns");
  await access("assets/mac/icon.icns");
  const info = await readPngInfo("assets/icon.png");
  assert.ok(info.width >= 1024);
  assert.ok(info.height >= 1024);
});

test("electron-builder uses the mac icns icon", async () => {
  const config = await readFile("electron-builder.yml", "utf8");
  assert.match(config, /icon:\s*assets\/mac\/icon\.icns/);
});
