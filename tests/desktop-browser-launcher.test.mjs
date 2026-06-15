import assert from "node:assert/strict";
import test from "node:test";
import { buildIncognitoAccountWindowConfig, normalizeTargetUrl } from "../scripts/lib/desktop-browser-launcher.mjs";

test("desktop launcher builds a temp incognito BrowserWindow config", () => {
  const config = buildIncognitoAccountWindowConfig({
    workspaceId: "workspace_a",
    accountId: "account_a",
    handle: "@builder",
    timestamp: 42
  });
  assert.equal(config.url, "https://x.com/builder");
  assert.equal(config.title, "AI Creator OS - @builder 无痕工作窗");
  assert.match(config.notice, /人工查看/);
  assert.equal(config.browserWindowOptions.webPreferences.partition, "temp:workspace_a:account_a:42");
  assert.equal(config.browserWindowOptions.webPreferences.partition.startsWith("persist:"), false);
  assert.equal(config.browserWindowOptions.webPreferences.nodeIntegration, false);
});

test("desktop launcher falls back to x home without handle", () => {
  assert.equal(normalizeTargetUrl({}), "https://x.com/home");
});
