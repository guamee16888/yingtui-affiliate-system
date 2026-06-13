import test from "node:test";
import assert from "node:assert/strict";
import { applyManagerTaskAction, applyManagerTaskBatchAction, buildManagerSummary } from "../scripts/lib/manager-system.mjs";

const workspaces = [
  {
    workspaceId: "workspace_default",
    name: "Default Workspace",
    managerUserIds: ["manager_a"],
    staffUserIds: ["staff_a"],
    enabledLaneIds: ["ai_startups"],
    active: true
  },
  {
    workspaceId: "workspace_other",
    name: "Other Workspace",
    managerUserIds: ["manager_b"],
    staffUserIds: ["staff_b"],
    enabledLaneIds: ["saas_founders"],
    active: true
  }
];

const users = [
  { userId: "manager_a", name: "Manager A", role: "manager", active: true },
  { userId: "manager_b", name: "Manager B", role: "manager", active: true },
  { userId: "staff_a", name: "Staff A", role: "staff", active: true },
  { userId: "staff_b", name: "Staff B", role: "staff", active: true }
];

const xAccounts = [
  { accountId: "ai_tools_lab", persona: "AI Tools Lab", managerUserId: "manager_a", ownerUserId: "manager_a", status: "active", dailyPostLimit: 10, externalLinkLimit: 1 },
  { accountId: "saas_ops", persona: "SaaS Ops", managerUserId: "manager_b", ownerUserId: "manager_b", status: "active", dailyPostLimit: 10, externalLinkLimit: 1 }
];

const assignments = [
  { userId: "staff_a", accountId: "ai_tools_lab", active: true },
  { userId: "staff_b", accountId: "saas_ops", active: true }
];

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_1",
    date: "2026-06-13",
    workspaceId: overrides.workspaceId || "workspace_default",
    laneId: overrides.laneId || "ai_startups",
    accountId: overrides.accountId || "ai_tools_lab",
    assignedTo: overrides.assignedTo || "staff_a",
    managerUserId: overrides.managerUserId || "manager_a",
    toolId: overrides.toolId || "tool_1",
    toolName: overrides.toolName || "Tool One",
    toolUrl: overrides.toolUrl || "https://tool.example.com",
    topicId: "topic_1",
    copyId: overrides.copyId || "copy_1",
    copyText: overrides.copyText || "A narrow AI workflow worth testing today.",
    variantType: "shortPost",
    status: overrides.status || "pending_review",
    approvalStatus: overrides.approvalStatus || "pending",
    duplicateCheckResult: overrides.duplicateCheckResult || { ok: true, riskLevel: "low", flags: [] },
    riskFlags: [],
    externalLinks: [],
    metrics: {}
  };
}

test("manager summary only includes selected workspace tasks", () => {
  const summary = buildManagerSummary({
    workspaceId: "workspace_default",
    managerUserId: "manager_a",
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [
      task(),
      task({ taskId: "task_other", workspaceId: "workspace_other", accountId: "saas_ops", assignedTo: "staff_b", managerUserId: "manager_b" })
    ],
    ledger: []
  });

  assert.equal(summary.accessAllowed, true);
  assert.equal(summary.selectedWorkspace.workspaceId, "workspace_default");
  assert.equal(summary.tasks.length, 1);
  assert.equal(summary.tasks[0].taskId, "task_1");
  assert.equal(summary.accounts.length, 1);
  assert.equal(summary.staff.length, 1);
});

test("manager can approve a workspace task", () => {
  const now = new Date("2026-06-13T08:00:00.000Z");
  const result = applyManagerTaskAction({
    input: {
      action: "approve",
      taskId: "task_1",
      workspaceId: "workspace_default",
      managerUserId: "manager_a"
    },
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary: [],
    tasks: [task()],
    ledger: [],
    accountHealth: [],
    contentRules: { rules: { maxSameToolPerEmployeeDay: 2, maxSameDomainPerDayGlobal: 5, maxExternalLinksPerAccountDay: 1 } },
    now
  });

  assert.equal(result.task.status, "assigned");
  assert.equal(result.task.approvalStatus, "approved");
  assert.equal(result.task.approvedBy, "manager_a");
  assert.equal(result.task.approvedAt, "2026-06-13T08:00:00.000Z");
});

test("manager can reject a workspace task with a reason", () => {
  const result = applyManagerTaskAction({
    input: {
      action: "reject",
      taskId: "task_1",
      workspaceId: "workspace_default",
      managerUserId: "manager_a",
      reason: "Too generic for this account."
    },
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task()],
    ledger: [],
    now: new Date("2026-06-13T08:00:00.000Z")
  });

  assert.equal(result.task.status, "draft");
  assert.equal(result.task.approvalStatus, "rejected");
  assert.match(result.task.notes, /Too generic/);
});

test("manager can batch reject tasks with a template reason", () => {
  const result = applyManagerTaskBatchAction({
    input: {
      action: "reject",
      taskIds: ["task_1", "task_2"],
      workspaceId: "workspace_default",
      managerUserId: "manager_a",
      reason: "Reject template: too generic for this workspace."
    },
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task({ taskId: "task_1" }), task({ taskId: "task_2", copyId: "copy_2", toolId: "tool_2" })],
    ledger: [],
    now: new Date("2026-06-13T08:00:00.000Z")
  });

  assert.equal(result.updated.length, 2);
  assert.equal(result.failed.length, 0);
  assert.equal(result.tasks.every((item) => item.approvalStatus === "rejected"), true);
  assert.match(result.tasks[0].notes, /Reject template/);
});

test("manager can assign account and staff before approval", () => {
  const result = applyManagerTaskAction({
    input: {
      action: "assign",
      taskId: "task_1",
      workspaceId: "workspace_default",
      managerUserId: "manager_a",
      accountId: "ai_tools_lab",
      assignedTo: "staff_a"
    },
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary: [],
    tasks: [task({ accountId: "", assignedTo: "" })],
    ledger: [],
    accountHealth: [],
    contentRules: { rules: {} }
  });

  assert.equal(result.task.accountId, "ai_tools_lab");
  assert.equal(result.task.assignedTo, "staff_a");
  assert.equal(result.task.status, "pending_review");
  assert.equal(result.task.approvalStatus, "pending");
});

test("manager cannot mutate another workspace task", () => {
  assert.throws(() => applyManagerTaskAction({
    input: {
      action: "approve",
      taskId: "task_other",
      workspaceId: "workspace_other",
      managerUserId: "manager_a"
    },
    workspaces,
    users,
    xAccounts,
    assignments,
    copyLibrary: [],
    tasks: [task({ taskId: "task_other", workspaceId: "workspace_other", accountId: "saas_ops", assignedTo: "staff_b", managerUserId: "manager_b" })],
    ledger: [],
    accountHealth: [],
    contentRules: { rules: {} }
  }), /not allowed/);
});
