import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, startDesktopXOAuth, upsertDesktopAccount } from "../scripts/lib/desktop-data-store.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("manual desktop accounts default to not connected login status", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_login_status", workspaceName: "Login Status" });
    const result = await upsertDesktopAccount({
      workspaceId: "workspace_login_status",
      handle: "@manual_login_status"
    });

    assert.equal(result.account.connectionStatus, "not_connected");
    assert.equal(result.account.oauthConnectionId, "");
  });
});

test("starting X OAuth without config does not create a logged-in account", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_no_oauth", workspaceName: "No OAuth" });
    await assert.rejects(startDesktopXOAuth(), /请先在设置里配置 X API \/ OAuth/);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    assert.equal(accounts.items.some((account) => account.connectionStatus === "connected"), false);
  });
});
