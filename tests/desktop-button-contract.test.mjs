import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");
const managerCss = await readFile(new URL("../manager/style.css", import.meta.url), "utf8");
const onboardingJs = await readFile(new URL("../manager/js/desktop-onboarding.js", import.meta.url), "utf8");
const serverJs = [
  await readFile(new URL("../scripts/ops/serve-dashboard.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../scripts/lib/dashboard/api-get-routes.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../scripts/lib/desktop/api-get-routes.mjs", import.meta.url), "utf8"),
  await readFile(new URL("../scripts/lib/desktop/api-post-routes.mjs", import.meta.url), "utf8")
].join("\n");
const desktopMainJs = await readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8");

test("manager UI data-action buttons have matching handlers", () => {
  const accountActions = literalDataValues(appJs, "data-account-action");
  const handledAccountActions = literalHandledActions(appJs);
  const drawerActions = new Set(["detail", "tasks", "posts", "feedback", "targets"]);
  for (const action of accountActions) {
    assert.equal(
      handledAccountActions.has(action) || drawerActions.has(action),
      true,
      `missing account action handler: ${action}`
    );
  }

  const taskActions = literalDataValues(appJs, "data-action");
  for (const action of taskActions) {
    assert.match(appJs, new RegExp(`action === "${escapeRegExp(action)}"`), `missing task action handler: ${action}`);
  }

  const batchActions = literalDataValues(appJs, "data-batch-action");
  for (const action of batchActions) {
    assert.match(appJs, new RegExp(`action === "${escapeRegExp(action)}"|batchActionLabel\\(action\\)`), `missing batch action handler: ${action}`);
  }

  const desktopTaskActions = literalDataValues(appJs, "data-desktop-task-action");
  for (const action of desktopTaskActions) {
    assert.match(appJs, new RegExp(`action === "${escapeRegExp(action)}"`), `missing desktop task action handler: ${action}`);
  }
});

test("desktop mode does not expose fake next-version buttons", () => {
  assert.equal(appJs.includes("下一版接入"), false);
});

test("desktop batch actions use local manager API instead of app API", () => {
  const applyBatch = sourceFunction(appJs, "async function applyBatch");
  assert.match(applyBatch, /if \(state\.appMode && !state\.desktopMode\)/);
  assert.match(applyBatch, /\/api\/manager\/task\/batch/);
  assert.match(applyBatch, /if \(action === "approve"\) \{\s+Object\.assign\(payload, compactAssignment\(batchAssignment\(\)\)\);/);
  assert.match(appJs, /function compactAssignment\(assignment\)/);
});

test("desktop manager hides Cloudflare logout and keeps local selectors usable", () => {
  assert.match(appJs, /button\.hidden = !state\.appMode \|\| state\.desktopMode/);
  assert.match(appJs, /workspaceSelect"\)\.disabled = state\.appMode && !state\.desktopMode/);
  assert.match(appJs, /managerSelect"\)\.disabled = state\.appMode && !state\.desktopMode/);
  assert.match(managerCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("desktop account console can reset all account filters", () => {
  assert.match(appJs, /data-account-action="reset-account-filters"/);
  assert.match(appJs, /state\.accountFilters = \{\s+query: "",\s+lane: "all",\s+status: "all",\s+connection: "all",\s+health: "all",\s+region: "all",\s+browser: "all"\s+\};/);
  assert.match(appJs, /账号筛选已重置/);
});

test("desktop account console uses fixed account windows as the visible login path", () => {
  assert.match(appJs, /openExternalUrl\(url\)/);
  assert.match(appJs, /系统浏览器打开 X 登录页/);
  assert.match(appJs, /账号工作窗/);
  assert.match(appJs, /openAccountWorkWindow\(account\)/);
  assert.match(appJs, /ensureAccountNetworkLock\(account\)/);
  assert.match(appJs, /当前公网 IP 不匹配/);
  assert.match(appJs, /openPersistentAccountWindow/);
  assert.match(appJs, /\/api\/desktop\/ads-browser\/open/);
  assert.match(appJs, /\/api\/desktop\/accounts\/persistent-window/);
  assert.match(appJs, /\/api\/desktop\/network\/current-ip/);
  assert.match(serverJs, /\/api\/desktop\/accounts\/persistent-window/);
  assert.match(serverJs, /\/api\/desktop\/network\/current-ip/);
  assert.match(desktopMainJs, /desktopHandlers: \{ openIncognitoAccountWindow, openPersistentAccountWindow \}/);
  assert.doesNotMatch(appJs, /data-account-action="incognito"|临时窗|打开无痕窗口|已打开无痕工作窗/);
});

test("desktop account console reserves network note fields with proxy support", () => {
  assert.match(appJs, /网络\/IP/);
  assert.match(appJs, /指定 IP \/ 出口/);
  assert.match(appJs, /代理地址/);
  assert.match(appJs, /默认浏览器模式下，账号工作窗会按这里的代理地址访问 X/);
  assert.match(appJs, /ADS 环境 ID/);
  assert.match(appJs, /name="accountBrowserProvider"/);
  assert.match(appJs, /name="accountAdsProfileId"/);
  assert.match(appJs, /data-account-inline-field="browserProvider"/);
  assert.match(appJs, /data-account-inline-field="adsProfileId"/);
  assert.match(appJs, /data-account-action="ensure-account-slots"/);
  assert.match(serverJs, /\/api\/desktop\/accounts\/ensure-slots/);
});

test("desktop status center is the default account operations view", () => {
  assert.match(appJs, /activeDesktopTab: "status"/);
  assert.match(appJs, /desktopTabButton\("status", "状态中心"\)/);
  assert.match(appJs, /function renderDesktopStatusCenterTab/);
  assert.match(appJs, /100 账号状态中心/);
  assert.match(appJs, /data-account-action="check-account-statuses"/);
  assert.match(appJs, /data-account-action="check-one-account-status"/);
  assert.match(appJs, /\/api\/desktop\/ads-browser\/test/);
  assert.match(appJs, /\/api\/desktop\/x-oauth\/status/);
});

test("desktop settings expose ADS browser API configuration", () => {
  assert.match(appJs, /ADS 浏览器 API/);
  assert.match(appJs, /name="adsBaseUrl"/);
  assert.match(appJs, /name="adsAccessText"/);
  assert.match(appJs, /data-account-action="save-ads-browser-config"/);
  assert.match(appJs, /data-account-action="test-ads-browser-config"/);
  assert.match(serverJs, /\/api\/desktop\/ads-browser\/open/);
});

test("desktop supply tab shows source network gap data", () => {
  assert.match(appJs, /desktopTabButton\("supply", "供给"\)/);
  assert.match(appJs, /function renderDesktopSupplyTab/);
  assert.match(appJs, /\/api\/source-network/);
  assert.match(appJs, /每日供给缺口/);
  assert.match(appJs, /data-account-action="save-source-network-source"/);
  assert.match(appJs, /data-account-action="refresh-source-network"/);
  assert.match(appJs, /data-account-action="toggle-source-status"/);
  assert.match(appJs, /\/api\/source-network\/source/);
  assert.match(appJs, /\/api\/source-network\/refresh/);
  assert.match(serverJs, /pathname === "\/api\/source-network"/);
  assert.match(serverJs, /\/api\/source-network\/source/);
  assert.match(serverJs, /\/api\/source-network\/source\/status/);
  assert.match(serverJs, /\/api\/source-network\/refresh/);
});

test("desktop tasks expose explicit X API publish controls", () => {
  assert.match(appJs, /data-desktop-task-action="publish-x"/);
  assert.match(appJs, /data-desktop-task-action="move-to-connected-account"/);
  assert.match(appJs, /primaryConnectedDesktopAccount/);
  assert.match(appJs, /\/api\/desktop\/tasks\/publish-x/);
  assert.match(appJs, /发布到 X/);
  assert.match(serverJs, /\/api\/desktop\/tasks\/publish-x/);
});

test("desktop first-run buttons are delegated through setup handler", () => {
  const setupActions = literalDataValues(onboardingJs, "data-desktop-setup");
  assert.deepEqual([...setupActions].sort(), ["complete", "demo"]);
  assert.match(appJs, /data-desktop-setup/);
  assert.match(appJs, /completeDesktopSetupFromUi/);
});

function literalDataValues(source, attribute) {
  const values = new Set();
  const pattern = new RegExp(`${attribute}="([^"$]+)"`, "g");
  for (const match of source.matchAll(pattern)) values.add(match[1]);
  return values;
}

function literalHandledActions(source) {
  const values = new Set();
  for (const match of source.matchAll(/if \(action === "([^"]+)"\)/g)) values.add(match[1]);
  return values;
}

function sourceFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing function: ${signature}`);
  const nextFunction = source.indexOf("\nfunction ", start + signature.length);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + signature.length);
  const candidates = [nextFunction, nextAsyncFunction].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
