import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop status labels are Chinese product labels", () => {
  for (const expected of [
    'pending_review: "待确认"',
    'pending: "待处理"',
    'approved: "已确认"',
    'rejected: "已拒绝"',
    'posted: "已发布"',
    'feedback_due: "待反馈"',
    'feedback_done: "已反馈"',
    'skipped: "已跳过"',
    'not_connected: "未登录"',
    'connected: "已登录"',
    'expired: "登录过期"',
    'revoked: "已退出"',
    'error: "登录异常"',
    'healthy: "正常"',
    'watch: "观察"',
    'risky: "风险"',
    'paused: "已暂停"'
  ]) {
    assert.ok(appJs.includes(expected), `missing label: ${expected}`);
  }
});

test("desktop copy and risk labels are Chinese", () => {
  for (const expected of [
    'shortPost: "短文案"',
    'casualPost: "日常文案"',
    'contrarianAngle: "反常识角度"',
    'painPointHook: "痛点开头"',
    'threadOpening: "长推开头"',
    'low: "风险低"',
    'medium: "风险中"',
    'high: "风险高"'
  ]) {
    assert.ok(appJs.includes(expected), `missing label: ${expected}`);
  }
  assert.doesNotMatch(appJs, /risk low/);
});
