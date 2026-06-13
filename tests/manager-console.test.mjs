import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildManagerSummary } from "../scripts/lib/manager-system.mjs";

const workspaces = [
  {
    workspaceId: "workspace_a",
    name: "Workspace A",
    plan: "client",
    accountLimit: 2,
    managerUserIds: ["manager_a"],
    staffUserIds: ["staff_a"],
    enabledLaneIds: ["saas_founders"],
    publishMode: "manual",
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    active: true
  },
  {
    workspaceId: "workspace_b",
    name: "Workspace B",
    plan: "client",
    accountLimit: 2,
    managerUserIds: ["manager_b"],
    staffUserIds: ["staff_b"],
    enabledLaneIds: ["ai_startups"],
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
  { workspaceId: "workspace_a", accountId: "account_a", persona: "SaaS Lab", status: "active", publishMode: "manual", dailyPostLimit: 10, externalLinkLimit: 1 },
  { workspaceId: "workspace_b", accountId: "account_b", persona: "AI Lab", status: "active", publishMode: "manual", dailyPostLimit: 10, externalLinkLimit: 1 }
];

const assignments = [
  { workspaceId: "workspace_a", accountId: "account_a", userId: "staff_a", active: true },
  { workspaceId: "workspace_b", accountId: "account_b", userId: "staff_b", active: true }
];

const contentLanes = [
  { laneId: "saas_founders", name: "SaaS 创始人圈", defaultStyle: "practical", blockedTopics: ["fake case study"] },
  { laneId: "ai_startups", name: "AI 创业圈", defaultStyle: "curious", blockedTopics: [] }
];

const workspaceLanes = [
  { workspaceId: "workspace_a", laneId: "saas_founders", enabled: true, priority: 1 },
  { workspaceId: "workspace_b", laneId: "ai_startups", enabled: true, priority: 1 }
];

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_a",
    workspaceId: overrides.workspaceId || "workspace_a",
    laneId: overrides.laneId || "saas_founders",
    accountId: overrides.accountId || "account_a",
    assignedTo: overrides.assignedTo || "staff_a",
    managerUserId: overrides.managerUserId || "manager_a",
    toolName: overrides.toolName || "Tool A",
    copyText: "A concise SaaS founder post.",
    status: overrides.status || "pending_review",
    approvalStatus: overrides.approvalStatus || "pending",
    duplicateCheckResult: overrides.duplicateCheckResult || { riskLevel: "low", flags: [] },
    riskFlags: overrides.riskFlags || []
  };
}

test("manager console summary exposes workspace-only modules", () => {
  const summary = buildManagerSummary({
    workspaceId: "workspace_a",
    managerUserId: "manager_a",
    workspaces,
    users,
    xAccounts,
    assignments,
    tasks: [
      task(),
      task({ taskId: "task_b", workspaceId: "workspace_b", laneId: "ai_startups", accountId: "account_b", assignedTo: "staff_b", managerUserId: "manager_b" })
    ],
    ledger: [],
    publishJobs: [{ jobId: "job_a", workspaceId: "workspace_a", accountId: "account_a", taskId: "task_a", status: "blocked", error: "Blocked by safety.", token: "secret" }],
    feedback: [],
    contentLanes,
    workspaceLanes,
    rawCandidates: [{ candidateId: "candidate_a", laneIds: ["saas_founders"], title: "SaaS thing" }]
  });

  assert.equal(summary.accessAllowed, true);
  assert.equal(summary.tasks.length, 1);
  assert.equal(summary.accounts.length, 1);
  assert.equal(summary.staff.length, 1);
  assert.equal(summary.lanes.length, 1);
  assert.equal(summary.lanes[0].laneId, "saas_founders");
  assert.equal(summary.publishJobs.length, 1);
  assert.equal(JSON.stringify(summary.publishJobs).includes("secret"), false);
  assert.equal(summary.settings.workspaceId, "workspace_a");
});

test("manager page is distinct from dashboard and staff pages", async () => {
  const [managerHtml, dashboardHtml, staffHtml] = await Promise.all([
    readFile(new URL("../manager/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard/index.html", import.meta.url), "utf8"),
    readFile(new URL("../staff/index.html", import.meta.url), "utf8")
  ]);

  assert.match(managerHtml, /AI Creator OS 管理端/);
  assert.doesNotMatch(managerHtml, /<h1>AI Creator OS 平台总后台<\/h1>/);
  assert.match(dashboardHtml, /AI Creator OS 平台总后台/);
  assert.match(staffHtml, /员工发文工作台/);
});
