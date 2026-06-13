import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { handlePagesAppRequest } from "../functions/api/app/v1/[[path]].mjs";

test("Pages Function route file exists", async () => {
  await access("functions/api/app/v1/[[path]].mjs");
});

test("Pages Function routes GET session through app API handlers", async () => {
  const response = await handlePagesAppRequest({
    request: new Request("https://app.guamee.org/api/app/v1/session"),
    env: { APP_ENV: "staging", APP_STORAGE_MODE: "d1" }
  }, {
    accessJwtPayload: { email: "manager@example.com", aud: "test", exp: future() },
    storage: fakeStorage()
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.email, "manager@example.com");
  assert.equal(json.data.workspaceId, "workspace_a");
});

test("Pages Function reports missing D1 binding clearly", async () => {
  const response = await handlePagesAppRequest({
    request: new Request("https://app.guamee.org/api/app/v1/session"),
    env: { APP_ENV: "staging", APP_STORAGE_MODE: "d1" }
  });
  assert.equal(response.status, 500);
  const json = await response.json();
  assert.equal(json.ok, false);
  assert.equal(json.code, "D1_BINDING_MISSING");
});

function fakeStorage() {
  return {
    async loadAuthCollections() {
      return fixtures();
    },
    async getWorkspace(workspaceId) {
      return { workspaceId, name: "Workspace A", accountLimit: 30, enabledLaneIds: [], publishMode: "manual", autoPublishEnabled: false, requiresFinalApproval: true };
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

function fixtures() {
  return {
    users: [
      { userId: "manager_a", email: "manager@example.com", name: "Manager A", role: "manager", active: true, workspaceId: "workspace_a" }
    ],
    workspaces: [
      { workspaceId: "workspace_a", name: "Workspace A", managerUserIds: ["manager_a"], staffUserIds: [], active: true }
    ],
    assignments: [],
    xAccounts: []
  };
}

function future() {
  return Math.floor(Date.now() / 1000) + 3600;
}
