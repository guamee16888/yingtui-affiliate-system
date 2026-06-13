import assert from "node:assert/strict";
import test from "node:test";
import { d1StorageAdapter } from "../scripts/lib/d1-storage-adapter.stub.mjs";
import { jsonStorageAdapter } from "../scripts/lib/json-storage-adapter.mjs";
import { REQUIRED_STORAGE_METHODS, createStorageAdapter } from "../scripts/lib/storage-adapter.mjs";

test("storage adapter validates required methods", () => {
  assert.deepEqual(REQUIRED_STORAGE_METHODS, [
    "getWorkspace",
    "listWorkspaceTasks",
    "listStaffTasks",
    "updateTaskStatus",
    "appendLedgerEntry",
    "upsertFeedback",
    "writeAuditLog"
  ]);
  assert.throws(() => createStorageAdapter({}), /missing methods/i);
});

test("json storage adapter can read default workspace and tasks", async () => {
  const workspace = await jsonStorageAdapter.getWorkspace("workspace_default");
  assert.equal(workspace.workspaceId, "workspace_default");
  const tasks = await jsonStorageAdapter.listWorkspaceTasks("workspace_default");
  assert.ok(Array.isArray(tasks));
});

test("d1 storage adapter is an explicit stub", () => {
  for (const method of REQUIRED_STORAGE_METHODS) {
    assert.throws(() => d1StorageAdapter[method](), /D1 adapter is not implemented yet/);
  }
});
