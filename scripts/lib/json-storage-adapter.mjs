import { CORE_COLLECTIONS, loadCollection, saveCollection } from "./core-data.mjs";
import { createStableId } from "./ids.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";
import { createStorageAdapter } from "./storage-adapter.mjs";

export const JSON_AUDIT_LOG_PATH = "data/audit-logs.json";

async function getWorkspace(workspaceId) {
  const workspaces = await loadCollection(SOURCE_LANE_FILES.workspaces);
  return workspaces.items.find((workspace) => workspace.workspaceId === workspaceId) ?? null;
}

async function listWorkspaceTasks(workspaceId, filters = {}) {
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  return tasks.items
    .filter((task) => taskWorkspaceId(task) === workspaceId)
    .filter((task) => !filters.status || task.status === filters.status)
    .filter((task) => !filters.accountId || task.accountId === filters.accountId);
}

async function listStaffTasks(workspaceId, userId, filters = {}) {
  const tasks = await listWorkspaceTasks(workspaceId, filters);
  return tasks.filter((task) => task.assignedTo === userId);
}

async function updateTaskStatus(workspaceId, taskId, patch = {}, actor = {}) {
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const current = tasks.items.find((task) => task.taskId === taskId && taskWorkspaceId(task) === workspaceId);
  if (!current) throw new Error(`Task not found in workspace: ${taskId}`);
  const next = {
    ...current,
    ...patch,
    workspaceId,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.userId || current.updatedBy || ""
  };
  await saveCollection(CORE_COLLECTIONS.postTasks, {
    ...tasks,
    items: tasks.items.map((task) => task.taskId === taskId ? next : task)
  });
  await writeAuditLog({
    type: "task.update",
    workspaceId,
    actorUserId: actor.userId || "",
    targetId: taskId,
    summary: `Task ${taskId} updated through JSON storage adapter.`
  });
  return next;
}

async function appendLedgerEntry(workspaceId, ledgerEntry = {}, actor = {}) {
  const ledger = await loadCollection(CORE_COLLECTIONS.postLedger);
  const now = new Date().toISOString();
  const entry = {
    ledgerId: ledgerEntry.ledgerId || createStableId("ledger", [workspaceId, ledgerEntry.taskId || "", now]),
    ...ledgerEntry,
    workspaceId,
    createdAt: ledgerEntry.createdAt || now,
    updatedAt: now,
    actorUserId: actor.userId || ledgerEntry.actorUserId || ""
  };
  await saveCollection(CORE_COLLECTIONS.postLedger, { ...ledger, items: [...ledger.items, entry] });
  await writeAuditLog({
    type: "ledger.append",
    workspaceId,
    actorUserId: actor.userId || "",
    targetId: entry.ledgerId,
    summary: "Ledger entry appended through JSON storage adapter."
  });
  return entry;
}

async function upsertFeedback(workspaceId, feedbackEntry = {}, actor = {}) {
  const feedback = await readJson("data/feedback.json", { version: 1, updatedAt: "", entries: [] });
  const now = new Date().toISOString();
  const entry = {
    id: feedbackEntry.id || createStableId("feedback", [workspaceId, feedbackEntry.taskId || "", feedbackEntry.copyText || "", now]),
    ...feedbackEntry,
    workspaceId,
    updatedAt: now,
    createdAt: feedbackEntry.createdAt || now,
    actorUserId: actor.userId || feedbackEntry.actorUserId || ""
  };
  const entries = (feedback.entries ?? []).filter((item) => item.id !== entry.id);
  entries.push(entry);
  await writeJsonAtomic("data/feedback.json", { ...feedback, entries, updatedAt: now });
  await writeAuditLog({
    type: "feedback.upsert",
    workspaceId,
    actorUserId: actor.userId || "",
    targetId: entry.id,
    summary: "Feedback upserted through JSON storage adapter."
  });
  return entry;
}

async function writeAuditLog(event = {}) {
  const current = await readJson(JSON_AUDIT_LOG_PATH, { version: 1, updatedAt: "", items: [] });
  const now = new Date().toISOString();
  const item = {
    auditId: event.auditId || createStableId("audit", [event.type || "event", event.workspaceId || "", event.targetId || "", now]),
    createdAt: event.createdAt || now,
    ...event
  };
  await writeJsonAtomic(JSON_AUDIT_LOG_PATH, {
    ...current,
    updatedAt: now,
    items: [...(current.items ?? []), item]
  });
  return item;
}

function taskWorkspaceId(task) {
  return task.workspaceId || "workspace_default";
}

export const jsonStorageAdapter = createStorageAdapter({
  getWorkspace,
  listWorkspaceTasks,
  listStaffTasks,
  updateTaskStatus,
  appendLedgerEntry,
  upsertFeedback,
  writeAuditLog
});

export default jsonStorageAdapter;
