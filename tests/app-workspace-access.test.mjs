import assert from "node:assert/strict";
import test from "node:test";
import { handleAppApiPost } from "../scripts/lib/app-api/session.mjs";

test("staff role cannot approve or reject manager tasks", async () => {
  const options = {
    storage: fakeStorage(),
    env: {},
    collections: {
      users: [
        { userId: "staff_a", email: "staff@example.com", name: "Staff A", role: "staff", active: true, workspaceId: "workspace_a" }
      ],
      workspaces: [
        { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: [], staffUserIds: ["staff_a"], active: true }
      ],
      assignments: [],
      xAccounts: []
    }
  };

  await assert.rejects(
    handleAppApiPost({
      request: request("/api/app/v1/manager/tasks/approve?devEmail=staff@example.com&workspaceId=workspace_a"),
      url: url("/api/app/v1/manager/tasks/approve?devEmail=staff@example.com&workspaceId=workspace_a"),
      body: { taskId: "task_a" },
      options
    }),
    (error) => error.code === "FORBIDDEN"
  );
});

function fakeStorage() {
  return {
    async getWorkspace() {
      return null;
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
    async writeAuditLog() {
      return {};
    }
  };
}

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function url(pathname) {
  return new URL(pathname, "http://localhost");
}
