import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { completeDesktopSetup, loadDesktopSetupStatus } from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop first run initializes appData outside repo data", async () => {
  await withDesktopTestEnv(async (dir) => {
    let status = await loadDesktopSetupStatus();
    assert.equal(status.setupCompleted, false);
    assert.equal(status.appDataDir, dir);
    assert.equal(status.dataDir, path.join(dir, "data"));

    status = await completeDesktopSetup({ mode: "empty_workspace", workspaceName: "Client Workspace" });
    assert.equal(status.setupCompleted, true);
    assert.equal(status.workspaceName, "Client Workspace");
    assert.equal(status.dataDir.startsWith(`${process.cwd()}${path.sep}data`), false);
  });
});
