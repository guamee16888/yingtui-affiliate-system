import assert from "node:assert/strict";
import test from "node:test";
import { handleAppApiGet, handleAppApiPost } from "../scripts/lib/app-api/session.mjs";

test("manager summary and tasks are scoped to current workspace", async () => {
  const options = testOptions();
  const result = await handleAppApiGet({
    request: request("/api/app/v1/manager/tasks?devEmail=manager@example.com&workspaceId=workspace_a"),
    url: url("/api/app/v1/manager/tasks?devEmail=manager@example.com&workspaceId=workspace_a"),
    options
  });
  assert.equal(result.payload.ok, true);
  assert.deepEqual(result.payload.data.tasks.map((task) => task.taskId), ["task_a"]);
});

test("approve task updates approvalStatus and writes audit log", async () => {
  const options = testOptions();
  const result = await handleAppApiPost({
    request: request("/api/app/v1/manager/tasks/approve?devEmail=manager@example.com&workspaceId=workspace_a"),
    url: url("/api/app/v1/manager/tasks/approve?devEmail=manager@example.com&workspaceId=workspace_a"),
    body: { taskId: "task_a" },
    options
  });
  assert.equal(result.payload.data.task.approvalStatus, "approved");
  assert.equal(options.storage.tasks[0].approvalStatus, "approved");
  assert.ok(options.storage.audit.some((entry) => entry.action === "task.approve"));
});

test("reject task requires a reason", async () => {
  const options = testOptions();
  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/tasks/reject?devEmail=manager@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/tasks/reject?devEmail=manager@example.com&workspaceId=workspace_a"),
      body: { taskId: "task_a" },
      options
    }),
    (error) => error.code === "REJECT_REASON_REQUIRED"
  );
});

test("rejecting another workspace task is refused", async () => {
  const options = testOptions();
  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/tasks/reject?devEmail=manager@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/tasks/reject?devEmail=manager@example.com&workspaceId=workspace_a"),
      body: { taskId: "task_b", reason: "Wrong workspace" },
      options
    }),
    (error) => error.code === "TASK_NOT_FOUND"
  );
});

test("feedback metrics cannot be negative", async () => {
  const options = testOptions();
  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/feedback?devEmail=manager@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/feedback?devEmail=manager@example.com&workspaceId=workspace_a"),
      body: { taskId: "task_a", metrics: { impressions: -1 } },
      options
    }),
    (error) => error.code === "INVALID_METRIC"
  );
});

test("feedback saves audit log and zero impressions do not produce NaN", async () => {
  const options = testOptions();
  const result = await handleAppApiPost({
    request: request("/api/app/v1/manager/feedback?devEmail=manager@example.com&workspaceId=workspace_a"),
    url: url("/api/app/v1/manager/feedback?devEmail=manager@example.com&workspaceId=workspace_a"),
    body: { taskId: "task_a", metrics: { impressions: 0, likes: 0 }, notes: "No signal yet" },
    options
  });
  assert.equal(Number.isNaN(result.payload.data.feedback.engagementRate), false);
  assert.equal(result.payload.data.feedback.engagementRate, 0);
  assert.ok(options.storage.audit.some((entry) => entry.action === "feedback.upsert"));
});

function testOptions() {
  const storage = fakeStorage();
  return {
    storage,
    env: {},
    collections: {
      users: [
        { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" }
      ],
      workspaces: [
        { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: ["staff_a"], active: true }
      ],
      assignments: [],
      xAccounts: []
    },
    async loadManagerSummary() {
      return {
        tasks: storage.tasks.filter((task) => task.workspaceId === "workspace_a"),
        accounts: [],
        staff: [],
        selectedWorkspace: { workspaceId: "workspace_a", name: "Workspace A" },
        selectedManager: { userId: "manager_a", role: "manager" },
        accessAllowed: true,
        summary: { totalTasks: 1 }
      };
    }
  };
}

function fakeStorage() {
  const storage = {
    tasks: [
      task({ taskId: "task_a", workspaceId: "workspace_a" }),
      task({ taskId: "task_b", workspaceId: "workspace_b" })
    ],
    audit: [],
    feedback: [],
    async getWorkspace(workspaceId) {
      return { workspaceId, name: "Workspace A", accountLimit: 30, enabledLaneIds: [], publishMode: "manual", autoPublishEnabled: false, requiresFinalApproval: true };
    },
    async listWorkspaceTasks(workspaceId) {
      return this.tasks.filter((item) => item.workspaceId === workspaceId);
    },
    async listStaffTasks() {
      return [];
    },
    async updateTaskStatus(workspaceId, taskId, patch) {
      const index = this.tasks.findIndex((item) => item.workspaceId === workspaceId && item.taskId === taskId);
      if (index < 0) throw new Error("Task not found in workspace");
      this.tasks[index] = { ...this.tasks[index], ...patch, updatedAt: "2026-06-13T08:00:00.000Z" };
      return this.tasks[index];
    },
    async appendLedgerEntry() {
      return {};
    },
    async upsertFeedback(workspaceId, entry) {
      const feedback = { ...entry, workspaceId };
      this.feedback.push(feedback);
      return feedback;
    },
    async writeAuditLog(entry) {
      this.audit.push(entry);
      return entry;
    }
  };
  return storage;
}

function task(overrides = {}) {
  return {
    taskId: "task_a",
    workspaceId: "workspace_a",
    accountId: "account_a",
    assignedTo: "staff_a",
    toolId: "tool_a",
    copyId: "copy_a",
    copyText: "A compact post.",
    status: "feedback_due",
    approvalStatus: "pending",
    metrics: {},
    ...overrides
  };
}

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function url(pathname) {
  return new URL(pathname, "http://localhost");
}
