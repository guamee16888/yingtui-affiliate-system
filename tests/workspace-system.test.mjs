import test from "node:test";
import assert from "node:assert/strict";
import { emptyCollection } from "../scripts/lib/core-data.mjs";
import { buildWorkspaceMigration, buildWorkspaceSummary } from "../scripts/lib/workspace-system.mjs";
import { buildSourceLaneSeed } from "../scripts/lib/source-lanes.mjs";

function emptySourceData() {
  return buildSourceLaneSeed({
    workspaces: emptyCollection(),
    contentLanes: emptyCollection(),
    sourceConnectors: emptyCollection(),
    sourceFeeds: emptyCollection(),
    rawCandidates: emptyCollection(),
    sourceRuns: emptyCollection(),
    workspaceLanes: emptyCollection(),
    manualCandidates: emptyCollection()
  }).next;
}

function workspaceFixture() {
  return {
    sourceData: emptySourceData(),
    core: {
      users: { version: 1, updatedAt: "", items: [{ userId: "manager_1", role: "manager", active: true }, { userId: "staff_1", role: "staff", active: true }] },
      xAccounts: { version: 1, updatedAt: "", items: [{ accountId: "ai_account", ownerUserId: "manager_1", managerUserId: "manager_1", status: "active" }] },
      assignments: { version: 1, updatedAt: "", items: [{ accountId: "ai_account", userId: "staff_1", active: true }] },
      postTasks: { version: 1, updatedAt: "", items: [{ taskId: "task_1", accountId: "ai_account", assignedTo: "staff_1", managerUserId: "manager_1" }] },
      postLedger: { version: 1, updatedAt: "", items: [{ ledgerId: "ledger_1", taskId: "task_1", accountId: "ai_account", employeeId: "staff_1" }] }
    },
    publish: {
      publishJobs: { version: 1, updatedAt: "", items: [{ jobId: "job_1", taskId: "task_1", accountId: "ai_account" }] },
      publishAttempts: { version: 1, updatedAt: "", items: [{ attemptId: "attempt_1", jobId: "job_1", taskId: "task_1" }] },
      xConnections: { version: 1, updatedAt: "", items: [{ connectionId: "conn_1", accountId: "ai_account" }] }
    },
    feedback: { entries: [{ id: "feedback_1", taskId: "task_1", accountId: "ai_account" }] }
  };
}

test("workspace migration creates default links and is idempotent", () => {
  const first = buildWorkspaceMigration({ ...workspaceFixture(), now: "2026-06-13T00:00:00.000Z" });
  const second = buildWorkspaceMigration({
    sourceData: first.sourceData,
    core: first.core,
    publish: first.publish,
    feedback: first.feedback,
    now: "2026-06-13T01:00:00.000Z"
  });

  assert.equal(first.sourceData.workspaces.items[0].workspaceId, "workspace_default");
  assert.equal(first.core.xAccounts.items[0].workspaceId, "workspace_default");
  assert.equal(first.core.postTasks.items[0].workspaceId, "workspace_default");
  assert.equal(first.core.postLedger.items[0].workspaceId, "workspace_default");
  assert.equal(first.publish.publishJobs.items[0].workspaceId, "workspace_default");
  assert.equal(first.feedback.entries[0].workspaceId, "workspace_default");
  assert.equal(second.stats.accountsUpdated, 0);
  assert.equal(second.stats.tasksUpdated, 0);
});

test("workspace summary reports counts and account limits", () => {
  const migrated = buildWorkspaceMigration({ ...workspaceFixture(), now: "2026-06-13T00:00:00.000Z" });
  const summary = buildWorkspaceSummary(migrated);

  assert.equal(summary.summary.workspaces, 1);
  assert.equal(summary.summary.accounts, 1);
  assert.equal(summary.summary.tasks, 1);
  assert.equal(summary.workspaces[0].staff, 1);
  assert.equal(summary.workspaces[0].managers, 1);
  assert.deepEqual(summary.usersWithoutWorkspace, []);
  assert.deepEqual(summary.accountsWithoutWorkspace, []);
});
