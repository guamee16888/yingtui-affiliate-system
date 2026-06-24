import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, importDesktopAccounts } from "../scripts/lib/storage/interface.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop account import supports country and ignores timezone plus sensitive fields", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_country", workspaceName: "Country Import" });
    const result = await importDesktopAccounts({
      workspaceId: "workspace_country",
      csv: "handle,lane,country,timezone,language,notes,password,cookie,proxy,fingerprint,token,secret\n@country_one,ai_startups,SG,Asia/Singapore,en,note,pw,cookie,proxy,fp,tok,sec"
    });

    assert.equal(result.count, 1);
    assert.deepEqual(result.ignoredFields.sort(), ["cookie", "fingerprint", "password", "proxy", "secret", "timezone", "token"]);
    assert.match(result.warning, /已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段/);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.handle === "@country_one");
    assert.ok(account);
    assert.equal(account.country, "SG");
    assert.equal(account.countryManual, true);
    assert.equal(account.region, "");
    assert.equal(account.timezone, "");
    assert.equal(account.connectionStatus, "not_connected");
  });
});
