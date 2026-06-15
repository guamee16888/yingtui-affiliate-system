import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeDesktopSetup, importDesktopAccounts, importDesktopNetworkNotes, updateDesktopAccountConfig } from "../scripts/lib/desktop-data-store.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

const appJs = await readFile(new URL("../manager/js/app.js", import.meta.url), "utf8");

test("desktop account detail exposes network and IP note config only", () => {
  for (const label of ["网络/IP 配置", "网络备注", "IP 归属备注", "设备备注", "国家/地区备注"]) {
    assert.match(appJs, new RegExp(label));
  }
  assert.match(appJs, /批量导入网络\/IP备注/);
  assert.match(appJs, /data-account-action="import-network-notes"/);
  assert.match(appJs, /handle,networkNote,ipNote,deviceNote,countryRegionNote/);
  assert.match(appJs, /不切换代理、不保存代理账号密码、不管理指纹、不改变系统网络/);
  assert.doesNotMatch(appJs, /proxyUrl|proxyHost|fingerprintId|rotateIp/);
});

test("network and IP config is saved as notes without proxy fields", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_network_note", workspaceName: "Network Note" });
    const result = await importDesktopAccounts({ workspaceId: "workspace_network_note", text: "@network_note" });
    const accountId = result.imported[0].accountId;
    await updateDesktopAccountConfig({
      accountId,
      networkLabel: "日本住宅宽带",
      ipNote: "东京",
      deviceNote: "备用手机",
      countryRegionNote: "日本"
    });
    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.accountId === accountId);
    assert.equal(account.networkLabel, "日本住宅宽带");
    assert.equal(account.ipNote, "东京");
    assert.equal(account.deviceNote, "备用手机");
    assert.equal(account.countryRegionNote, "日本");
    assert.equal(account.proxy, undefined);
    assert.equal(account.fingerprint, undefined);
  });
});

test("batch network note import updates existing accounts by handle", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_network_batch", workspaceName: "Network Batch" });
    await importDesktopAccounts({ workspaceId: "workspace_network_batch", text: "@network_a\n@network_b" });
    const result = await importDesktopNetworkNotes({
      workspaceId: "workspace_network_batch",
      csv: "handle,networkNote,ipNote,deviceNote,countryRegionNote\n@network_a,日本住宅宽带,东京,Pixel 7,日本\n@missing,美国 VPS,洛杉矶,备用手机,美国"
    });
    assert.equal(result.updatedCount, 1);
    assert.equal(result.skippedCount, 1);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.handle === "@network_a");
    assert.equal(account.networkLabel, "日本住宅宽带");
    assert.equal(account.ipNote, "东京");
    assert.equal(account.deviceNote, "Pixel 7");
    assert.equal(account.countryRegionNote, "日本");
    assert.equal(accounts.items.some((item) => item.handle === "@missing"), false);
  });
});

test("batch network note import updates existing accounts by accountId", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_network_id", workspaceName: "Network ID" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_network_id", text: "@network_id" });
    const accountId = imported.imported[0].accountId;
    const result = await importDesktopNetworkNotes({
      workspaceId: "workspace_network_id",
      csv: `accountId,networkNote,ipNote,deviceNote,countryRegionNote\n${accountId},自用网络,新加坡,备用手机,新加坡`
    });
    assert.equal(result.updatedCount, 1);
    assert.equal(result.skippedCount, 0);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.accountId === accountId);
    assert.equal(account.networkLabel, "自用网络");
    assert.equal(account.ipNote, "新加坡");
    assert.equal(account.deviceNote, "备用手机");
    assert.equal(account.countryRegionNote, "新加坡");
  });
});

test("batch network note import ignores sensitive fields and does not store proxy data", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_network_sensitive", workspaceName: "Network Sensitive" });
    await importDesktopAccounts({ workspaceId: "workspace_network_sensitive", text: "@network_sensitive" });
    const result = await importDesktopNetworkNotes({
      workspaceId: "workspace_network_sensitive",
      csv: "handle,networkNote,password,cookie,proxy,fingerprint,token,secret,timezone\n@network_sensitive,家庭网络,pw,cookie,proxy,fp,tok,sec,UTC"
    });
    assert.equal(result.updatedCount, 1);
    assert.deepEqual(result.ignoredFields.sort(), ["cookie", "fingerprint", "password", "proxy", "secret", "timezone", "token"]);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.handle === "@network_sensitive");
    assert.equal(account.networkLabel, "家庭网络");
    for (const field of ["password", "cookie", "cookies", "proxy", "fingerprint", "token", "secret"]) {
      assert.equal(account[field], undefined);
    }
    assert.equal(account.timezone, "");
  });
});
