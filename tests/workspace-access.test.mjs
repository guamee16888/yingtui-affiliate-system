import test from "node:test";
import assert from "node:assert/strict";
import { applyStaffTaskAction, buildStaffSummary } from "../scripts/lib/staff-system.mjs";
import { buildManagerSummary } from "../scripts/lib/manager-system.mjs";

const workspaces = [
  { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: ["staff_a"], enabledLaneIds: ["ai_startups"], active: true },
  { workspaceId: "workspace_b", name: "Workspace B", managerUserIds: ["manager_b"], staffUserIds: ["staff_b"], enabledLaneIds: ["saas_founders"], active: true }
];

const users = [
  { userId: "manager_a", role: "manager", workspaceId: "workspace_a", active: true },
  { userId: "manager_b", role: "manager", workspaceId: "workspace_b", active: true },
  { userId: "staff_a", role: "staff", workspaceId: "workspace_a", active: true },
  { userId: "staff_b", role: "staff", workspaceId: "workspace_b", active: true }
];

const xAccounts = [
  { accountId: "account_a", workspaceId: "workspace_a", status: "active", persona: "AI Account" },
  { accountId: "account_b", workspaceId: "workspace_b", status: "active", persona: "SaaS Account" }
];

const assignments = [
  { accountId: "account_a", userId: "staff_a", workspaceId: "workspace_a", active: true },
  { accountId: "account_b", userId: "staff_b", workspaceId: "workspace_b", active: true }
];

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_a",
    workspaceId: overrides.workspaceId || "workspace_a",
    accountId: overrides.accountId || "account_a",
    assignedTo: overrides.assignedTo || "staff_a",
    managerUserId: overrides.managerUserId || "manager_a",
    toolName: overrides.toolName || "Tool",
    copyText: "A short valid post.",
    status: "assigned",
    approvalStatus: "approved",
    duplicateCheckResult: { ok: true, riskLevel: "low", flags: [] },
    riskFlags: []
  };
}

test("manager summary filters to selected workspace", () => {
  const summary = buildManagerSummary({
    workspaceId: "workspace_a",
    managerUserId: "manager_a",
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task(), task({ taskId: "task_b", workspaceId: "workspace_b", accountId: "account_b", assignedTo: "staff_b", managerUserId: "manager_b" })],
    ledger: []
  });

  assert.equal(summary.accessAllowed, true);
  assert.deepEqual(summary.tasks.map((item) => item.taskId), ["task_a"]);
  assert.deepEqual(summary.accounts.map((item) => item.accountId), ["account_a"]);
});

test("staff summary filters by workspace and assignedTo", () => {
  const summary = buildStaffSummary({
    workspaceId: "workspace_a",
    userId: "staff_a",
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [
      task(),
      task({ taskId: "task_same_workspace_other_staff", assignedTo: "staff_b" }),
      task({ taskId: "task_b", workspaceId: "workspace_b", accountId: "account_b", assignedTo: "staff_b" })
    ],
    ledger: []
  });

  assert.equal(summary.accessAllowed, true);
  assert.deepEqual(summary.tasks.map((item) => item.taskId), ["task_a"]);
  assert.deepEqual(summary.accounts.map((item) => item.accountId), ["account_a"]);
});

test("staff cannot act across workspace or on another staff task", () => {
  assert.throws(() => applyStaffTaskAction({
    input: { workspaceId: "workspace_b", userId: "staff_a", taskId: "task_b", action: "copy" },
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task({ taskId: "task_b", workspaceId: "workspace_b", accountId: "account_b", assignedTo: "staff_b" })],
    ledger: []
  }), /not allowed|not assigned|does not belong/);

  assert.throws(() => applyStaffTaskAction({
    input: { workspaceId: "workspace_a", userId: "staff_a", taskId: "task_other", action: "copy" },
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task({ taskId: "task_other", assignedTo: "staff_b" })],
    ledger: []
  }), /not assigned/);
});
