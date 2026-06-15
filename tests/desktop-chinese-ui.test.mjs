import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../manager/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop shell copy is Chinese and toolbox-oriented", () => {
  for (const required of ["AI Creator OS 桌面版", "多账号 X 运营工具箱", "账号工具箱", "数据空间", "操作者"]) {
    assert.match(html, new RegExp(required));
  }
  for (const forbidden of ["AI Creator OS · Workspace Manager", "Workspace 管理端", "任务审核"]) {
    assert.equal(html.includes(forbidden), false);
  }
});

test("desktop settings explain safety boundaries in Chinese", () => {
  for (const required of ["不保存 X 密码", "不保存 cookie", "不管理代理", "不做指纹浏览器", "不自动关注、点赞、评论或发推"]) {
    assert.match(appJs, new RegExp(required));
  }
  assert.match(appJs, /手动添加的账号默认未登录/);
  assert.match(appJs, /网络\/IP 只是人工备注/);
  assert.match(appJs, /不会保存密码、cookie、代理或指纹信息/);
});
