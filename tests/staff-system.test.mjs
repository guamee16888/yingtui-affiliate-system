import test from "node:test";
import assert from "node:assert/strict";
import { applyStaffTaskAction, buildStaffSummary } from "../scripts/lib/staff-system.mjs";

const users = [
  { userId: "user_owner", name: "Owner", role: "admin", active: true },
  { userId: "staff_a", name: "Staff A", role: "staff", active: true }
];

const xAccounts = [
  { accountId: "ai_tools_lab", persona: "AI Tools Lab", niche: "AI tools", status: "active", dailyPostLimit: 10, externalLinkLimit: 1 },
  { accountId: "saas_ops", persona: "SaaS Ops", niche: "SaaS founders", status: "active", dailyPostLimit: 10, externalLinkLimit: 1 }
];

const assignments = [
  { userId: "staff_a", accountId: "ai_tools_lab", active: true }
];

function task(overrides = {}) {
  return {
    taskId: overrides.taskId || "task_1",
    date: "2026-06-13",
    accountId: overrides.accountId || "ai_tools_lab",
    assignedTo: overrides.assignedTo || "staff_a",
    toolId: overrides.toolId || "tool_1",
    toolName: overrides.toolName || "Tool One",
    toolUrl: overrides.toolUrl || "https://tool.example.com",
    topicId: "topic_1",
    copyId: "copy_1",
    copyText: overrides.copyText || "A narrow AI workflow worth testing today.",
    variantType: "shortPost",
    status: overrides.status || "assigned",
    approvalStatus: overrides.approvalStatus || "approved",
    duplicateCheckResult: overrides.duplicateCheckResult || { ok: true, riskLevel: "low", flags: [] },
    riskFlags: [],
    externalLinks: [],
    metrics: {}
  };
}

test("staff summary only shows assigned employee tasks and length status", () => {
  const summary = buildStaffSummary({
    userId: "staff_a",
    users,
    xAccounts,
    assignments,
    tasks: [
      task(),
      task({ taskId: "task_other", accountId: "saas_ops", assignedTo: "user_owner" }),
      task({ taskId: "task_long", copyText: "a".repeat(281) })
    ],
    ledger: []
  });

  assert.equal(summary.selectedUser.userId, "staff_a");
  assert.equal(summary.accounts.length, 1);
  assert.equal(summary.tasks.length, 2);
  assert.equal(summary.summary.ready, 1);
  assert.equal(summary.summary.overLimit, 1);
  assert.equal(summary.tasks.find((item) => item.taskId === "task_long").canCopy, false);
});

test("staff posted action is manual and writes central ledger", () => {
  const now = new Date("2026-06-13T08:00:00.000Z");
  const result = applyStaffTaskAction({
    input: {
      userId: "staff_a",
      taskId: "task_1",
      action: "posted",
      postedUrl: "https://x.com/me/status/1"
    },
    users,
    xAccounts,
    assignments,
    tasks: [task()],
    ledger: [],
    now
  });

  assert.equal(result.task.status, "feedback_due");
  assert.equal(result.task.approvalStatus, "approved");
  assert.equal(result.task.postedAt, "2026-06-13T08:00:00.000Z");
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].taskId, "task_1");
  assert.equal(result.ledger[0].employeeId, "staff_a");
  assert.equal(result.ledger[0].postedUrl, "https://x.com/me/status/1");
});

test("staff action rejects blocked or over-limit tasks", () => {
  assert.throws(() => applyStaffTaskAction({
    input: { userId: "staff_a", taskId: "task_blocked", action: "copy" },
    users,
    xAccounts,
    assignments,
    tasks: [task({
      taskId: "task_blocked",
      duplicateCheckResult: {
        ok: false,
        riskLevel: "block",
        flags: [{ message: "duplicate copy" }]
      }
    })],
    ledger: []
  }), /duplicate copy/);

  assert.throws(() => applyStaffTaskAction({
    input: { userId: "staff_a", taskId: "task_long", action: "copy" },
    users,
    xAccounts,
    assignments,
    tasks: [task({ taskId: "task_long", copyText: "a".repeat(281) })],
    ledger: []
  }), /281\/280/);
});

test("staff cannot act on tasks before manager approval", () => {
  const summary = buildStaffSummary({
    userId: "staff_a",
    users,
    xAccounts,
    assignments,
    tasks: [task({ status: "pending_review", approvalStatus: "pending" })],
    ledger: []
  });
  assert.equal(summary.tasks.length, 0);

  assert.throws(() => applyStaffTaskAction({
    input: { userId: "staff_a", taskId: "task_1", action: "copy" },
    users,
    xAccounts,
    assignments,
    tasks: [task({ status: "pending_review", approvalStatus: "pending" })],
    ledger: []
  }), /manager approval/);
});
