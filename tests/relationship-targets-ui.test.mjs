import assert from "node:assert/strict";
import test from "node:test";
import { addDesktopRelationshipTargets, completeDesktopSetup, importDesktopAccounts, updateDesktopRelationshipTargetStatus } from "../scripts/lib/storage/interface.mjs";
import { readJson } from "../scripts/lib/file-store.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop relationship targets can be added and marked followed manually", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_targets", workspaceName: "Target Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_targets", text: "@source_account" });
    const accountId = imported.imported[0].accountId;
    const added = await addDesktopRelationshipTargets({
      workspaceId: "workspace_targets",
      accountId,
      targetHandle: "@target_one",
      category: "watch",
      reason: "Useful founder account"
    });
    assert.equal(added.items[0].status, "suggested");

    const updated = await updateDesktopRelationshipTargetStatus({
      workspaceId: "workspace_targets",
      accountId,
      targetId: added.items[0].targetId,
      status: "followed_manually"
    });
    assert.equal(updated.item.status, "followed_manually");
    const audit = await readJson("data/audit-logs.json", { items: [] });
    assert.ok(audit.items.some((item) => item.type === "relationship_target.followed_manually"));
  });
});
