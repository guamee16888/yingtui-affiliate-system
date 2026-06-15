import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerSummary } from "../scripts/lib/manager-system.mjs";

test("account vault only exposes current workspace accounts with health fields", () => {
  const summary = buildManagerSummary({
    managerUserId: "manager_a",
    workspaceId: "workspace_a",
    workspaces: [{ workspaceId: "workspace_a", name: "A", managerUserIds: ["manager_a"], active: true }],
    users: [{ userId: "manager_a", role: "manager", active: true }],
    xAccounts: [
      { accountId: "acc_a", workspaceId: "workspace_a", status: "active", handle: "@a", language: "en" },
      { accountId: "acc_b", workspaceId: "workspace_b", status: "active", handle: "@b" }
    ],
    assignments: [],
    tasks: [{ taskId: "task_a", workspaceId: "workspace_a", accountId: "acc_a", status: "feedback_due", metrics: {} }],
    ledger: [{ ledgerId: "ledger_a", workspaceId: "workspace_a", accountId: "acc_a", postedAt: new Date().toISOString(), externalLinks: [] }],
    publishJobs: [],
    feedback: []
  });
  assert.deepEqual(summary.accounts.map((account) => account.accountId), ["acc_a"]);
  assert.equal(summary.accounts[0].workspaceId, "workspace_a");
  assert.equal(typeof summary.accounts[0].healthScore, "number");
  assert.equal(summary.accounts[0].pendingFeedback, 1);
});
