import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, createDesktopTask, importDesktopAccounts, markDesktopTaskPosted } from "../scripts/lib/desktop-data-store.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop task workbench creates and marks manual post tasks", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_task", workspaceName: "Task Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_task", text: "@task_account" });
    const accountId = imported.imported[0].accountId;
    const created = await createDesktopTask({
      workspaceId: "workspace_task",
      accountId,
      assignedTo: "user_owner",
      copyText: "Small teams do not need more content tools. They need a cleaner way to decide what is worth posting today."
    });
    assert.equal(created.task.status, "pending_review");
    assert.equal(created.task.fitsTweetLimit, true);

    const posted = await markDesktopTaskPosted({ taskId: created.task.taskId, postedUrl: "https://x.com/example/status/1" });
    assert.equal(posted.task.status, "feedback_due");
    assert.equal(posted.ledger.publishMode, "manual");
  });
});

test("desktop task workbench rejects over 280 weighted characters", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_long", workspaceName: "Long Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_long", text: "@long_account" });
    await assert.rejects(
      createDesktopTask({
        workspaceId: "workspace_long",
        accountId: imported.imported[0].accountId,
        copyText: "x".repeat(281)
      }),
      /weighted characters/
    );
  });
});
