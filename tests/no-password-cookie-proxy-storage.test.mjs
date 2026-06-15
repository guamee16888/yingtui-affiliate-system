import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, importDesktopAccounts } from "../scripts/lib/desktop-data-store.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop import ignores password cookie proxy fingerprint token and secret fields", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_sensitive_import", workspaceName: "Sensitive Import" });
    const result = await importDesktopAccounts({
      workspaceId: "workspace_sensitive_import",
      csv: "handle,lane,country,language,password,cookie,proxy,fingerprint,token,secret,timezone\n@sensitive,ai_startups,,en,pw,cookie,proxy,fp,tok,sec,UTC"
    });
    assert.equal(result.count, 1);
    assert.deepEqual(result.ignoredFields.sort(), ["cookie", "fingerprint", "password", "proxy", "secret", "timezone", "token"]);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const account = accounts.items.find((item) => item.handle === "@sensitive");
    assert.ok(account);
    for (const field of ["password", "cookie", "cookies", "proxy", "fingerprint", "token", "secret", "timezone"]) {
      assert.equal(account[field], field === "timezone" ? "" : undefined);
    }
    assert.equal(account.connectionStatus, "not_connected");
    assert.equal(account.country, "");
  });
});
