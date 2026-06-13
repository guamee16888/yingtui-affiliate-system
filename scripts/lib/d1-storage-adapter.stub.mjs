import { createStorageAdapter } from "./storage-adapter.mjs";

const NOT_IMPLEMENTED = "D1 adapter is not implemented yet.";

function notImplemented() {
  throw new Error(NOT_IMPLEMENTED);
}

// Future mapping:
// getWorkspace -> workspaces
// listWorkspaceTasks/listStaffTasks/updateTaskStatus -> post_tasks
// appendLedgerEntry -> post_ledger
// upsertFeedback -> feedback
// writeAuditLog -> audit_logs
// Token material must stay outside D1 rows returned to the browser. x_connections stores token_ref only.
export const d1StorageAdapter = createStorageAdapter({
  getWorkspace: notImplemented,
  listWorkspaceTasks: notImplemented,
  listStaffTasks: notImplemented,
  updateTaskStatus: notImplemented,
  appendLedgerEntry: notImplemented,
  upsertFeedback: notImplemented,
  writeAuditLog: notImplemented
});

export default d1StorageAdapter;
