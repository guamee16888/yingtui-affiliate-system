import test from "node:test";
import assert from "node:assert/strict";
import { applyManagerTaskAction, buildManagerSummary } from "../scripts/lib/manager-system.mjs";

const workspaces = [
  { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: ["staff_a"], enabledLaneIds: ["saas_founders"], active: true },
  { workspaceId: "workspace_b", name: "Workspace B", managerUserIds: ["manager_b"], staffUserIds: ["staff_b"], enabledLaneIds: ["ai_startups"], active: true }
];

const users = [
  { userId: "manager_a", role: "manager", active: true },
  { userId: "manager_b", role: "manager", active: true },
  { userId: "staff_a", role: "staff", active: true },
  { userId: "staff_b", role: "staff", active: true }
];

const xAccounts = [
  { workspaceId: "workspace_a", accountId: "account_a", persona: "SaaS A", status: "active" },
  { workspaceId: "workspace_b", accountId: "account_b", persona: "AI B", status: "active" }
];

const assignments = [
  { workspaceId: "workspace_a", accountId: "account_a", userId: "staff_a", active: true },
  { workspaceId: "workspace_b", accountId: "account_b", userId: "staff_b", active: true }
];

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_a",
    workspaceId: overrides.workspaceId || "workspace_a",
    laneId: overrides.laneId || "saas_founders",
    accountId: overrides.accountId || "account_a",
    assignedTo: overrides.assignedTo || "staff_a",
    managerUserId: overrides.managerUserId || "manager_a",
    toolName: "Tool",
    copyText: "A short post.",
    status: "pending_review",
    approvalStatus: "pending",
    duplicateCheckResult: { riskLevel: "low", flags: [] },
    riskFlags: []
  };
}

test("manager modules only return the selected workspace", () => {
  const summary = buildManagerSummary({
    workspaceId: "workspace_a",
    managerUserId: "manager_a",
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task(), task({ taskId: "task_b", workspaceId: "workspace_b", laneId: "ai_startups", accountId: "account_b", assignedTo: "staff_b", managerUserId: "manager_b" })],
    ledger: [{ workspaceId: "workspace_b", ledgerId: "ledger_b", taskId: "task_b", accountId: "account_b" }],
    publishJobs: [{ workspaceId: "workspace_b", jobId: "job_b", taskId: "task_b", accountId: "account_b" }],
    feedback: [{ workspaceId: "workspace_b", taskId: "task_b", accountId: "account_b" }],
    contentLanes: [
      { laneId: "saas_founders", name: "SaaS 创始人圈" },
      { laneId: "ai_startups", name: "AI 创业圈" }
    ],
    workspaceLanes: [
      { workspaceId: "workspace_a", laneId: "saas_founders", enabled: true },
      { workspaceId: "workspace_b", laneId: "ai_startups", enabled: true }
    ],
    rawCandidates: []
  });

  assert.deepEqual(summary.tasks.map((item) => item.workspaceId), ["workspace_a"]);
  assert.deepEqual(summary.accounts.map((item) => item.accountId), ["account_a"]);
  assert.deepEqual(summary.staff.map((item) => item.userId), ["staff_a"]);
  assert.deepEqual(summary.publishJobs, []);
  assert.deepEqual(summary.lanes.map((item) => item.laneId), ["saas_founders"]);
  assert.equal(summary.feedbackDebt.length, 0);
});

test("manager cannot approve or reject another workspace task", () => {
  assert.throws(() => applyManagerTaskAction({
    input: { workspaceId: "workspace_b", managerUserId: "manager_a", taskId: "task_b", action: "reject" },
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [task({ taskId: "task_b", workspaceId: "workspace_b", accountId: "account_b", assignedTo: "staff_b", managerUserId: "manager_b" })],
    ledger: []
  }), /not allowed|无权/);
});
