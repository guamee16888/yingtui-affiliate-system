export const REQUIRED_STORAGE_METHODS = [
  "getWorkspace",
  "listWorkspaceTasks",
  "listStaffTasks",
  "updateTaskStatus",
  "appendLedgerEntry",
  "upsertFeedback",
  "writeAuditLog"
];

export function createStorageAdapter(implementation = {}) {
  const missing = REQUIRED_STORAGE_METHODS.filter((method) => typeof implementation[method] !== "function");
  if (missing.length) {
    throw new Error(`Storage adapter missing methods: ${missing.join(", ")}`);
  }
  return Object.freeze({ ...implementation });
}
