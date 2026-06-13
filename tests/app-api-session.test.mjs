import assert from "node:assert/strict";
import test from "node:test";
import { getAuthContext } from "../scripts/lib/app-api/auth-context.mjs";
import { handleAppApiGet } from "../scripts/lib/app-api/session.mjs";

test("unauthenticated app API returns UNAUTHENTICATED", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session"), { collections: fixtures() }),
    (error) => error.code === "UNAUTHENTICATED"
  );
});

test("devEmail local mode can create a session", async () => {
  const result = await handleAppApiGet({
    request: request("/api/app/v1/session?devEmail=owner@guamee.local"),
    url: url("/api/app/v1/session?devEmail=owner@guamee.local"),
    options: { storage: fakeStorage(), collections: fixtures(), env: {} }
  });
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.data.userId, "user_owner");
  assert.equal(result.payload.data.workspaceId, "workspace_default");
  assert.equal(result.payload.data.isDev, true);
});

test("production mode rejects devEmail", async () => {
  await assert.rejects(
    getAuthContext(request("/api/app/v1/session?devEmail=owner@guamee.local"), {
      collections: fixtures(),
      env: { NODE_ENV: "production" }
    }),
    (error) => error.code === "DEV_EMAIL_DISABLED"
  );
});

test("Cloudflare Access email resolves user and workspace", async () => {
  const context = await getAuthContext(request("/api/app/v1/session", {
    "cf-access-authenticated-user-email": "manager@example.com"
  }), { collections: fixtures(), env: {} });
  assert.equal(context.email, "manager@example.com");
  assert.equal(context.userId, "manager_a");
  assert.equal(context.role, "manager");
  assert.deepEqual(context.workspaceIds, ["workspace_a"]);
});

function request(pathname, headers = {}) {
  return { url: pathname, headers };
}

function url(pathname) {
  return new URL(pathname, "http://localhost");
}

function fixtures() {
  return {
    users: [
      { userId: "user_owner", name: "Owner", role: "admin", active: true, workspaceId: "workspace_default" },
      { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" }
    ],
    workspaces: [
      { workspaceId: "workspace_default", name: "Default", managerUserIds: ["user_owner"], staffUserIds: ["user_owner"], active: true },
      { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: [], active: true }
    ],
    assignments: [],
    xAccounts: []
  };
}

function fakeStorage() {
  return {
    async getWorkspace(workspaceId) {
      return { workspaceId, name: "Default", accountLimit: 30, enabledLaneIds: [], publishMode: "manual", autoPublishEnabled: false, requiresFinalApproval: true };
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
