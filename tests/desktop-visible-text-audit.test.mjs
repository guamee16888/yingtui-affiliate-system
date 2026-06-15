import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DESKTOP_VISIBLE_FORBIDDEN_TERMS, findForbiddenVisibleTerms } from "../scripts/desktop-visible-text-audit.mjs";

test("desktop visible text audit flags forbidden page terms with snippets", () => {
  const findings = findForbiddenVisibleTerms([
    { name: "账号库", text: "账号库\n演示账号\nAmerica/New_York\n授权状态\n账号状态" }
  ]);
  assert.deepEqual(findings.map((finding) => finding.term), ["演示账号", "演示", "账号状态", "授权状态", "America/New_York"]);
  assert.equal(findings[0].section, "账号库");
  assert.match(findings[0].snippet, /演示账号/);
});

test("desktop visible text audit allows current toolbox wording", () => {
  const cleanText = [
    "AI Creator OS 桌面版",
    "多账号 X 运营工具箱",
    "账号总数",
    "已登录",
    "未登录",
    "待确认",
    "待反馈",
    "风险账号",
    "登录状态",
    "国家",
    "X API / OAuth 配置",
    "连接 X 账号"
  ].join("\n");
  assert.deepEqual(findForbiddenVisibleTerms([{ name: "clean", text: cleanText }]), []);
});

test("desktop visible text audit command is wired in package scripts", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:ui:audit"], "node scripts/desktop-visible-text-audit.mjs");
  for (const term of ["演示账号", "账号状态", "时区", "America/New_York", "shortPost", "下一版接入"]) {
    assert.ok(DESKTOP_VISIBLE_FORBIDDEN_TERMS.includes(term));
  }
});
