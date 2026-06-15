import { CORE_COLLECTIONS, loadCollection, saveCollection } from "./core-data.mjs";
import { createStableId } from "./ids.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { listRelationshipTargets as listTargets, upsertRelationshipTarget, updateRelationshipTargetStatus } from "./relationship-targets.mjs";
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

async function loadAuthCollections() {
  const [users, workspaces, assignments, xAccounts, subscriptions, userIdentities] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(SOURCE_LANE_FILES.workspaces),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    readJson("data/subscriptions.json", { items: [] }),
    readJson("data/user-identities.json", { items: [] })
  ]);
  return {
    users: users.items.filter((user) => user.active !== false && user.status !== "disabled"),
    workspaces: workspaces.items.filter((workspace) => workspace.active !== false && workspace.status !== "archived"),
    assignments: assignments.items.filter((assignment) => assignment.active !== false),
    xAccounts: xAccounts.items,
    subscriptions: subscriptions.items || [],
    userIdentities: userIdentities.items || []
  };
}

async function getWorkspaceEntitlement(workspaceId) {
  const subscriptions = await readJson("data/subscriptions.json", { items: [] });
  return (subscriptions.items || []).find((item) => item.workspaceId === workspaceId) || null;
}

async function getUserIdentity(userId, provider) {
  const identities = await readJson("data/user-identities.json", { items: [] });
  return (identities.items || []).find((item) => item.userId === userId && item.provider === provider) || null;
}

async function upsertUserIdentity(identity = {}, actor = {}) {
  const identities = await readJson("data/user-identities.json", { items: [] });
  const now = new Date().toISOString();
  const item = {
    identityId: identity.identityId || createStableId("identity", [identity.userId || "", identity.provider || "discord"]),
    ...identity,
    provider: identity.provider || "discord",
    status: identity.status || "verified",
    verifiedAt: identity.verifiedAt || now,
    createdAt: identity.createdAt || now,
    updatedAt: now
  };
  const items = (identities.items || []).filter((current) => !(current.userId === item.userId && current.provider === item.provider));
  items.push(item);
  await writeJsonAtomic("data/user-identities.json", { ...identities, items, updatedAt: now });
  await writeLicenseEvent({
    workspaceId: actor.workspaceId || "",
    userId: item.userId || "",
    action: `${item.provider}.identity.verified`,
    metadata: { providerUserId: item.providerUserId || "", guildId: item.guildId || "" }
  });
  return item;
}

async function writeLicenseEvent(event = {}) {
  const events = await readJson("data/license-events.json", { items: [] });
  const now = new Date().toISOString();
  const item = {
    licenseEventId: event.licenseEventId || createStableId("license_event", [
      event.workspaceId || "",
      event.userId || "",
      event.action || "event",
      now
    ]),
    ...event,
    createdAt: event.createdAt || now
  };
  await writeJsonAtomic("data/license-events.json", {
    ...events,
    items: [...(events.items || []), item],
    updatedAt: now
  });
  return item;
}

async function listRelationshipTargets(workspaceId, accountId) {
  return listTargets({ workspaceId, accountId });
}

async function upsertRelationshipTargetForStorage(workspaceId, accountId, input = {}, actor = {}) {
  return upsertRelationshipTarget({ workspaceId, accountId, input, actor });
}

async function updateRelationshipTargetStatusForStorage(workspaceId, accountId, targetId, status, notes = "", actor = {}) {
  return updateRelationshipTargetStatus({ workspaceId, accountId, targetId, status, notes, actor });
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
  writeAuditLog,
  loadAuthCollections,
  getWorkspaceEntitlement,
  getUserIdentity,
  upsertUserIdentity,
  writeLicenseEvent,
  listRelationshipTargets,
  upsertRelationshipTarget: upsertRelationshipTargetForStorage,
  updateRelationshipTargetStatus: updateRelationshipTargetStatusForStorage
});

export default jsonStorageAdapter;
