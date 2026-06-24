import assert from "node:assert/strict";
import test from "node:test";
import { completeDesktopSetup, createDesktopTask, importDesktopAccounts, markDesktopTaskPosted, saveDesktopFeedback } from "../scripts/lib/storage/interface.mjs";
import { withDesktopTestEnv } from "./helpers/desktop-test-env.mjs";

test("desktop feedback stores non-negative metrics without NaN and completes task", async () => {
  await withDesktopTestEnv(async () => {
    await completeDesktopSetup({ mode: "empty_workspace", workspaceId: "workspace_feedback", workspaceName: "Feedback Test" });
    const imported = await importDesktopAccounts({ workspaceId: "workspace_feedback", text: "@feedback_account" });
    const created = await createDesktopTask({
      workspaceId: "workspace_feedback",
      accountId: imported.imported[0].accountId,
      assignedTo: "user_owner",
      copyText: "A useful local content workflow should make feedback boring enough that people actually enter it."
    });
    await markDesktopTaskPosted({ taskId: created.task.taskId });
    const result = await saveDesktopFeedback({
      taskId: created.task.taskId,
      metrics: { impressions: 0, likes: 0, bookmarks: 0, replies: 0, reposts: 0, clicks: 0, profileVisits: 0 },
      notes: "No metrics yet."
    });
    assert.equal(result.task.status, "feedback_done");
    assert.equal(Number.isNaN(result.feedback.engagementRate), false);
    assert.equal(result.feedback.engagementRate, 0);

    await assert.rejects(
      saveDesktopFeedback({ taskId: created.task.taskId, metrics: { likes: -1 } }),
      /non-negative/
    );
  });
});
