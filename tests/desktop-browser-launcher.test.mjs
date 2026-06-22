import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIncognitoAccountWindowConfig,
  buildPersistentAccountWindowConfig,
  normalizeTargetUrl
} from "../scripts/lib/desktop-browser-launcher.mjs";

test("desktop launcher builds a temp incognito BrowserWindow config", () => {
  const config = buildIncognitoAccountWindowConfig({
    workspaceId: "workspace_a",
    accountId: "account_a",
    handle: "@builder",
    timestamp: 42
  });
  assert.equal(config.url, "https://x.com/builder");
  assert.equal(config.title, "AI Creator OS - @builder 临时工作窗");
  assert.match(config.notice, /人工查看/);
  assert.equal(config.browserWindowOptions.webPreferences.partition, "temp:workspace_a:account_a:42");
  assert.equal(config.browserWindowOptions.webPreferences.partition.startsWith("persist:"), false);
  assert.equal(config.browserWindowOptions.webPreferences.nodeIntegration, false);
});

test("desktop launcher builds a persistent account BrowserWindow config", () => {
  const config = buildPersistentAccountWindowConfig({
    workspaceId: "workspace_a",
    accountId: "account_a",
    handle: "@builder"
  });
  assert.equal(config.url, "https://x.com/builder");
  assert.equal(config.title, "AI Creator OS - @builder 固定账号窗口");
  assert.match(config.notice, /保留本机浏览器登录态/);
  assert.equal(config.browserWindowOptions.webPreferences.partition, "persist:aicos:workspace_a:account_a");
  assert.equal(config.browserWindowOptions.webPreferences.nodeIntegration, false);
});

test("desktop launcher falls back to x home without handle", () => {
  assert.equal(normalizeTargetUrl({}), "https://x.com/home");
});
