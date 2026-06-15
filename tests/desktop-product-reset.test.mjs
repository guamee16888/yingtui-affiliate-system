import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../manager/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop product reset opens as a five-tab account toolbox", () => {
  assert.match(html, /AI Creator OS 桌面版/);
  assert.match(html, /多账号 X 运营工具箱/);
  assert.equal(html.includes("Workspace 管理端"), false);
  assert.match(appJs, /activeDesktopTab: "accounts"/);
  for (const label of ["账号库", "任务", "目标关系", "数据反馈", "设置"]) {
    assert.match(appJs, new RegExp(label));
  }
});

test("desktop product reset does not expose fake automation buttons", () => {
  for (const forbidden of ["下一版接入", "批量关注", "自动点赞", "自动评论", "批量发布"]) {
    assert.equal(appJs.includes(forbidden), false, `unexpected visible fake feature copy: ${forbidden}`);
  }
  assert.doesNotMatch(appJs, /data-account-action="auto-follow"/);
  assert.doesNotMatch(appJs, /data-account-action="batch-follow"/);
});

test("desktop product reset labels internal statuses in Chinese", () => {
  assert.match(appJs, /pending_review: "待确认"/);
  assert.match(appJs, /approved: "已确认"/);
  assert.match(appJs, /rejected: "已拒绝"/);
  assert.match(appJs, /feedback_done: "已反馈"/);
  assert.match(appJs, /not_connected: "未登录"/);
  assert.match(appJs, /connected: "已登录"/);
});
