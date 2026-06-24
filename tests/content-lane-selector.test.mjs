import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeDesktopSetup, importDesktopAccounts, updateDesktopAccountConfig } from "../scripts/lib/storage/interface.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop account detail exposes a Chinese content lane selector", () => {
  assert.match(appJs, /修改内容线/);
  assert.match(appJs, /contentLaneOptions\(account\.laneId \|\| "none"\)/);
  assert.match(appJs, /data-account-inline-field="laneId"/);
  assert.match(appJs, /inline-account-select/);
  const desktopAccountsTab = sourceFunction(appJs, "function renderDesktopAccountsTab");
  assert.doesNotMatch(desktopAccountsTab, /desktopFilterSelect\("lane", "内容线"/);
  assert.doesNotMatch(desktopAccountsTab, /desktopFilterSelect\("region", "国家"/);
  for (const label of ["AI 创业圈", "独立开发者圈", "SaaS 创始人圈", "Crypto 圈", "未分类"]) {
    assert.match(appJs, new RegExp(label));
  }
});

function sourceFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing function: ${signature}`);
  const nextFunction = source.indexOf("\nfunction ", start + signature.length);
  const end = nextFunction > start ? nextFunction : source.length;
  return source.slice(start, end);
}

test("desktop account content lane can be updated and normalized", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_lane_update", workspaceName: "Lane Update" });
    const result = await importDesktopAccounts({ workspaceId: "workspace_lane_update", text: "@lane_update" });
    const accountId = result.imported[0].accountId;
    const updated = await updateDesktopAccountConfig({ accountId, laneId: "crypto_builders" });
    assert.equal(updated.account.laneId, "crypto_builders");

    const fallback = await updateDesktopAccountConfig({ accountId, laneId: "unknown_lane" });
    assert.equal(fallback.account.laneId, "none");

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    assert.equal(accounts.items.find((account) => account.accountId === accountId).laneId, "none");
  });
});
