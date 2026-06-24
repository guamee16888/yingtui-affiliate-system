import assert from "node:assert/strict";
import test from "node:test";
import { archiveDesktopAccount, completeDesktopSetup, importDesktopAccounts } from "../scripts/lib/storage/interface.mjs";
import { loadCollection, CORE_COLLECTIONS } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop account import supports paste and CSV while ignoring unsafe fields", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceName: "Import Test" });
    const result = await importDesktopAccounts({
      workspaceId: "workspace_import_test",
      text: "@manual_one",
      csv: "handle,lane,country,timezone,language,networkLabel,ipNote,sessionMode,notes,password,cookie,proxy,fingerprint\n@csv_one,ai_startups,US,UTC,en,home_wifi,ip note,fixed_note,note,secret,cookie,proxy,fp"
    });
    assert.equal(result.count, 2);
    assert.match(result.warning, /已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段/);
    assert.deepEqual(result.ignoredFields.sort(), ["cookie", "fingerprint", "password", "proxy", "timezone"]);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    assert.ok(accounts.items.some((account) => account.handle === "@manual_one"));
    const csvAccount = accounts.items.find((account) => account.handle === "@csv_one");
    assert.ok(csvAccount);
    assert.equal(csvAccount.networkLabel, "home_wifi");
    assert.equal(csvAccount.ipNote, "ip note");
    assert.equal(csvAccount.sessionMode, "fixed_note");
    assert.equal(csvAccount.country, "US");
    assert.equal(csvAccount.countryManual, true);
    assert.equal(csvAccount.region, "");
    assert.equal(csvAccount.timezone, "");
    assert.equal(csvAccount.proxy, undefined);
  });
});

test("desktop account delete archives instead of hard deleting", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceName: "Archive Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_archive_test", text: "@archive_me" });
    const accountId = imported.imported[0].accountId;
    const result = await archiveDesktopAccount({ accountId });
    assert.equal(result.account.status, "archived");
    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    assert.ok(accounts.items.some((account) => account.accountId === accountId && account.status === "archived"));
  });
});
