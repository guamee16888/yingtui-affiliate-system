import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../manager/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");
const onboardingJs = await readFile(new URL("../manager/js/desktop-onboarding.js", import.meta.url), "utf8");
const seedAccounts = JSON.parse(await readFile(new URL("../desktop/seed-data/x-accounts.json", import.meta.url), "utf8"));
const seedWorkspaces = JSON.parse(await readFile(new URL("../desktop/seed-data/workspaces.json", import.meta.url), "utf8"));
const seedUsers = JSON.parse(await readFile(new URL("../desktop/seed-data/users.json", import.meta.url), "utf8"));
const seedTargets = JSON.parse(await readFile(new URL("../desktop/seed-data/relationship-targets.json", import.meta.url), "utf8"));
const seedTools = JSON.parse(await readFile(new URL("../desktop/seed-data/tools.json", import.meta.url), "utf8"));

test("desktop visible shell avoids backend/demo terminology", () => {
  const desktopSurface = [
    html,
    onboardingJs,
    sourceBetween(appJs, "function renderDesktopFirstRun", "function renderSelectors")
  ].join("\n");

  for (const forbidden of [
    "Workspace 管理端",
    "Workspace Manager",
    "演示账号",
    "演示",
    "正式",
    "类型",
    "时区",
    "timezone",
    "授权状态",
    "America/New_York",
    "Asia/Tokyo",
    "UTC",
    "shortPost",
    "risk low",
    "下一版接入"
  ]) {
    assert.equal(desktopSurface.includes(forbidden), false, `desktop surface still contains: ${forbidden}`);
  }
});

test("desktop navigation and account table use toolbox labels", () => {
  const accountTab = sourceBetween(appJs, "function renderDesktopAccountsTab", "function desktopFilterSelect");
  const table = sourceBetween(appJs, "function renderDesktopAccountTable", "function renderDesktopAccountTableRow");
  for (const label of ["账号库", "任务", "目标关系", "数据反馈", "设置"]) {
    assert.match(appJs, new RegExp(label));
  }
  for (const label of ["登录状态", "国家", "网络/IP"]) {
    assert.match(accountTab + table, new RegExp(label));
  }
  assert.doesNotMatch(accountTab, /账号状态/);
  assert.doesNotMatch(accountTab, /accountOptionsFrom\("status"\)/);
  assert.match(appJs, /"待确认"/);
  assert.doesNotMatch(appJs, /待确认任务/);
  assert.doesNotMatch(appJs, /任务类型/);
  assert.doesNotMatch(table, />类型</);
  assert.doesNotMatch(table, /授权状态/);
  assert.doesNotMatch(table, /时区|timezone/);
});

test("desktop seed data does not expose demo naming in visible fields", () => {
  const visibleSeedText = [
    ...seedAccounts.items.flatMap((item) => [item.handle, item.persona, item.notes]),
    ...seedWorkspaces.items.map((item) => item.name),
    ...seedUsers.items.map((item) => item.name),
    ...seedTargets.items.flatMap((item) => [item.targetHandle, item.notes]),
    ...seedTools.items.flatMap((item) => [item.name, item.tagline])
  ].join("\n");

  for (const forbidden of ["demo_operator", "Demo Staff", "Desktop Demo", "Demo account", "A demo"]) {
    assert.equal(visibleSeedText.includes(forbidden), false, `visible seed data still contains: ${forbidden}`);
  }
});

function sourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing source end: ${endNeedle}`);
  return source.slice(start, end);
}
