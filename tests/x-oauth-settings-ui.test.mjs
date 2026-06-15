import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop settings explain OAuth login without password or cookie storage", () => {
  assert.match(appJs, /X API \/ OAuth 配置/);
  assert.match(appJs, /AI Creator OS 不保存 X 密码或 cookie/);
  assert.match(appJs, /用本地 tokenRef 维持 API 连接/);
  assert.match(appJs, /tweet\.read/);
  assert.match(appJs, /tweet\.write/);
  assert.match(appJs, /users\.read/);
  assert.match(appJs, /offline\.access/);
  assert.match(appJs, /http:\/\/127\.0\.0\.1:\$\{port\}\/api\/oauth\/x\/callback/);
});

test("desktop settings expose system browser open and OAuth config test actions", () => {
  assert.match(appJs, /data-account-action="open-system-x"/);
  assert.match(appJs, /用系统浏览器打开 X/);
  assert.match(appJs, /data-account-action="test-x-oauth-config"/);
  assert.match(appJs, /X API \/ OAuth 配置完整/);
});

test("desktop settings do not include X password or cookie input fields", () => {
  assert.doesNotMatch(appJs, /name="xPassword"/);
  assert.doesNotMatch(appJs, /name="xCookie"/);
  assert.doesNotMatch(appJs, /name="cookie"/);
  assert.doesNotMatch(appJs, /name="proxy"/);
  assert.doesNotMatch(appJs, /name="fingerprint"/);
});
