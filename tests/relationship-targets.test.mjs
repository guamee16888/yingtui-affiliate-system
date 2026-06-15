import assert from "node:assert/strict";
import test from "node:test";
import { handleAppApiGet, handleAppApiPost } from "../scripts/lib/app-api/session.mjs";

test("relationship targets are filtered by workspace and account", async () => {
  const options = testOptions();
  const result = await handleAppApiGet({
    request: request("/api/app/v1/manager/accounts/acc_a/targets?devEmail=manager@example.com&workspaceId=workspace_a"),
    url: url("/api/app/v1/manager/accounts/acc_a/targets?devEmail=manager@example.com&workspaceId=workspace_a"),
    options
  });
  assert.equal(result.payload.ok, true);
  assert.deepEqual(result.payload.data.items.map((item) => item.targetId), ["target_a"]);
});

test("relationship target status update writes audit log", async () => {
  const options = testOptions();
  const result = await handleAppApiPost({
    request: request("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=manager@example.com&workspaceId=workspace_a"),
    url: url("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=manager@example.com&workspaceId=workspace_a"),
    body: { targetId: "target_a", status: "opened" },
    options
  });
  assert.equal(result.payload.data.item.status, "opened");
  assert.ok(options.storage.audit.some((entry) => entry.action === "relationship_target.status"));
});

test("relationship target batch status update is refused", async () => {
  const options = testOptions();
  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=manager@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=manager@example.com&workspaceId=workspace_a"),
      body: { targetIds: ["target_a"], status: "opened" },
      options
    }),
    (error) => error.code === "TARGET_BATCH_FORBIDDEN"
  );
});

test("staff cannot update manager relationship targets", async () => {
  const options = testOptions("staff@example.com");
  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=staff@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/accounts/acc_a/targets/status?devEmail=staff@example.com&workspaceId=workspace_a"),
      body: { targetId: "target_a", status: "opened" },
      options
    }),
    (error) => error.code === "FORBIDDEN"
  );
});

function testOptions() {
  const storage = fakeStorage();
  return {
    storage,
    env: {},
    collections: {
      users: [
        { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" },
        { userId: "staff_a", email: "staff@example.com", name: "Staff A", role: "staff", active: true, workspaceId: "workspace_a" }
      ],
      workspaces: [{ workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: ["staff_a"], active: true }],
      assignments: [],
      xAccounts: []
    },
    async loadManagerSummary() {
      return {
        accounts: [{ accountId: "acc_a", workspaceId: "workspace_a" }],
        staff: [],
        selectedWorkspace: { workspaceId: "workspace_a", name: "Workspace A" },
        selectedManager: { userId: "manager_a", role: "manager" },
        accessAllowed: true,
        summary: { totalTasks: 0 },
        tasks: []
      };
    }
  };
}

function fakeStorage() {
  return {
    targets: [
      { targetId: "target_a", workspaceId: "workspace_a", accountId: "acc_a", targetHandle: "@target_a", status: "suggested" },
      { targetId: "target_b", workspaceId: "workspace_a", accountId: "acc_b", targetHandle: "@target_b", status: "suggested" }
    ],
    audit: [],
    async getWorkspace(workspaceId) {
      return { workspaceId, name: "Workspace A", accountLimit: 30, enabledLaneIds: [], publishMode: "manual" };
    },
    async listWorkspaceTasks() {
      return [];
    },
    async listStaffTasks() {
      return [];
    },
    async updateTaskStatus() {
      return {};
    },
    async appendLedgerEntry() {
      return {};
    },
    async upsertFeedback() {
      return {};
    },
    async writeAuditLog(entry) {
      this.audit.push(entry);
      return entry;
    },
    async listRelationshipTargets(workspaceId, accountId) {
      return this.targets.filter((item) => item.workspaceId === workspaceId && item.accountId === accountId);
    },
    async updateRelationshipTargetStatus(workspaceId, accountId, targetId, status) {
      const item = this.targets.find((target) => target.workspaceId === workspaceId && target.accountId === accountId && target.targetId === targetId);
      item.status = status;
      return { item, audit: { action: "relationship_target.status", workspaceId, targetId } };
    },
    async upsertRelationshipTarget(workspaceId, accountId, input) {
      const item = { targetId: input.targetId || "target_new", workspaceId, accountId, targetHandle: input.targetHandle, status: input.status || "suggested" };
      this.targets.push(item);
      return { item, audit: { action: "relationship_target.upsert", workspaceId, targetId: item.targetId } };
    }
  };
}

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function url(pathname) {
  return new URL(pathname, "http://localhost");
}
