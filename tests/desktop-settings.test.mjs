import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, exportDesktopAccountsCsv, exportDesktopBackupPackage, loadDesktopSetupStatus } from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop settings expose local dirs and export actions", async () => {
  await withDesktopTestEnv(async (dir) => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_settings", workspaceName: "Settings Test" });
    const status = await loadDesktopSetupStatus();
    assert.equal(status.appDataDir, dir);
    assert.match(status.logsDir, /logs$/);
    assert.equal(status.desktopMode, true);

    const csv = await exportDesktopAccountsCsv("workspace_settings");
    assert.match(csv, /^accountId,handle,lane,country,language,loginStatus,status,publishMode,dailyPostLimit,externalLinkLimit,workEnvironment,adsProfileId,networkLabel,ipNote,sessionMode,notes/);
    const backup = await exportDesktopBackupPackage();
    assert.equal(backup.path.startsWith(dir), true);
  });
});
