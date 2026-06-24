import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDesktopSetup,
  exportDesktopAccountsCsv,
  importDesktopAccounts,
  upsertDesktopAccount
} from "../scripts/lib/storage/interface.mjs";
import { CORE_COLLECTIONS, loadCollection } from "../scripts/lib/core-data.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("manual handle import creates demo accounts only", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_demo", workspaceName: "Demo Boundary" });
    const result = await importDesktopAccounts({
      workspaceId: "workspace_demo",
      text: "@manual_demo",
      csv: "handle,lane,country,language,notes\n@csv_demo,ai_startups,US,en,note"
    });
    assert.equal(result.count, 2);

    const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
    const imported = accounts.items.filter((account) => account.workspaceId === "workspace_demo");
    assert.equal(imported.length, 2);
    assert.deepEqual(imported.map((account) => account.accountType), ["demo", "demo"]);
    assert.deepEqual(imported.map((account) => account.connectionStatus), ["not_connected", "not_connected"]);

    const csv = await exportDesktopAccountsCsv("workspace_demo");
    assert.doesNotMatch(csv.split("\n")[0], /accountType/);
    assert.match(csv.split("\n")[0], /country/);
    assert.match(csv.split("\n")[0], /networkLabel,ipNote,sessionMode/);
    assert.doesNotMatch(csv, /official/);
  });
});

test("plain upsert cannot turn a handle into an official account", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_official", workspaceName: "Official Boundary" });
    const result = await upsertDesktopAccount({
      workspaceId: "workspace_official",
      handle: "@oauth_future",
      accountType: "official",
      connectionStatus: "connected"
    });
    assert.equal(result.account.accountType, "demo");
    assert.equal(result.account.connectionStatus, "not_connected");
  });
});
