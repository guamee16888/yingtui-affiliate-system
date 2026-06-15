import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");
const managerCss = await readFile(new URL("../manager/style.css", import.meta.url), "utf8");
const onboardingJs = await readFile(new URL("../manager/js/desktop-onboarding.js", import.meta.url), "utf8");
const serverJs = await readFile(new URL("../scripts/serve-dashboard.mjs", import.meta.url), "utf8");
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
  assert.match(appJs, /state\.accountFilters = \{\s+query: "",\s+lane: "all",\s+status: "all",\s+connection: "all",\s+health: "all",\s+region: "all"\s+\};/);
  assert.match(appJs, /账号筛选已重置/);
});

test("desktop account console separates OAuth from temporary windows", () => {
  assert.match(appJs, /openExternalUrl\(url\)/);
  assert.match(appJs, /系统浏览器打开 X 登录页/);
  assert.match(appJs, /打开临时窗/);
  assert.match(appJs, /openTemporaryAccountWindow/);
  assert.match(appJs, /\/api\/desktop\/accounts\/incognito/);
  assert.match(serverJs, /\/api\/desktop\/accounts\/incognito/);
  assert.match(desktopMainJs, /desktopHandlers: \{ openIncognitoAccountWindow \}/);
  assert.doesNotMatch(appJs, /打开无痕窗口|已打开无痕工作窗/);
});

test("desktop account console reserves network note fields without proxy automation", () => {
  assert.match(appJs, /网络\/IP/);
  assert.match(appJs, /网络\/IP 只是人工备注/);
  assert.match(appJs, /不接代理、不存 cookie\/密码\/指纹/);
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
