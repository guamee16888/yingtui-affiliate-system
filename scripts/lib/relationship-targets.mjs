import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { createStableId } from "./ids.mjs";

export const RELATIONSHIP_TARGETS_PATH = "data/relationship-targets.json";

const VALID_STATUSES = new Set(["suggested", "opened", "followed_manually", "ignored", "watch"]);

export async function loadRelationshipTargets() {
  return normalizeRelationshipTargets(await readJson(RELATIONSHIP_TARGETS_PATH, emptyRelationshipTargets()));
}

export async function listRelationshipTargets({ workspaceId, accountId } = {}, collection) {
  const data = normalizeRelationshipTargets(collection || await loadRelationshipTargets());
  return data.items
    .filter((item) => !workspaceId || item.workspaceId === workspaceId)
    .filter((item) => !accountId || item.accountId === accountId);
}

export async function upsertRelationshipTarget({ workspaceId, accountId, input = {}, actor = {}, collection } = {}) {
  const now = new Date().toISOString();
  const current = normalizeRelationshipTargets(collection || await loadRelationshipTargets());
  const targetHandle = normalizeHandle(input.targetHandle || input.handle || "");
  if (!workspaceId) throw new Error("workspaceId is required");
  if (!accountId) throw new Error("accountId is required");
  if (!targetHandle) throw new Error("targetHandle is required");
  const targetId = input.targetId || createStableId("target", [workspaceId, accountId, targetHandle]);
  const existing = current.items.find((item) => item.targetId === targetId);
  const item = {
    targetId,
    workspaceId,
    accountId,
    targetHandle,
    targetUserId: String(input.targetUserId || existing?.targetUserId || ""),
    category: String(input.category || existing?.category || "watch"),
    reason: String(input.reason || existing?.reason || ""),
    status: normalizeStatus(input.status || existing?.status || "suggested"),
    notes: String(input.notes ?? existing?.notes ?? ""),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const items = current.items.filter((target) => target.targetId !== targetId);
  items.push(item);
  const next = { ...current, updatedAt: now, items };
  if (!collection) await writeJsonAtomic(RELATIONSHIP_TARGETS_PATH, next);
  return { item, collection: next, audit: auditEvent(actor, "relationship_target.upsert", workspaceId, item) };
}

export async function updateRelationshipTargetStatus({ workspaceId, accountId, targetId, status, notes = "", actor = {}, collection } = {}) {
  const now = new Date().toISOString();
  const current = normalizeRelationshipTargets(collection || await loadRelationshipTargets());
  const item = current.items.find((target) => target.workspaceId === workspaceId && target.accountId === accountId && target.targetId === targetId);
  if (!item) throw new Error("Relationship target not found");
  const updated = {
    ...item,
    status: normalizeStatus(status),
    notes: notes === "" ? item.notes || "" : String(notes),
    updatedAt: now
  };
  const next = {
    ...current,
    updatedAt: now,
    items: current.items.map((target) => target.targetId === targetId ? updated : target)
  };
  if (!collection) await writeJsonAtomic(RELATIONSHIP_TARGETS_PATH, next);
  return { item: updated, collection: next, audit: auditEvent(actor, "relationship_target.status", workspaceId, updated) };
}

export function normalizeRelationshipTargets(data = {}) {
  return {
    version: Number(data.version || 1),
    updatedAt: data.updatedAt || "",
    items: Array.isArray(data.items) ? data.items.map(normalizeItem) : []
  };
}

export function emptyRelationshipTargets() {
  return { version: 1, updatedAt: "", items: [] };
}

function normalizeItem(item = {}) {
  return {
    targetId: String(item.targetId || ""),
    workspaceId: String(item.workspaceId || "workspace_default"),
    accountId: String(item.accountId || ""),
    targetHandle: normalizeHandle(item.targetHandle || ""),
    targetUserId: String(item.targetUserId || ""),
    category: String(item.category || "watch"),
    reason: String(item.reason || ""),
    status: normalizeStatus(item.status || "suggested"),
    notes: String(item.notes || ""),
    createdAt: String(item.createdAt || ""),
    updatedAt: String(item.updatedAt || "")
  };
}

function normalizeHandle(handle) {
  const value = String(handle || "").trim();
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

function normalizeStatus(status) {
  const value = String(status || "suggested").trim();
  if (!VALID_STATUSES.has(value)) throw new Error("Invalid relationship target status");
  return value;
}

function auditEvent(actor, action, workspaceId, item) {
  return {
    action,
    type: action,
    workspaceId,
    actorUserId: actor.userId || "",
    targetId: item.targetId,
    targetType: "relationship_target",
    summary: `${action} ${item.targetHandle} for ${item.accountId}`,
    metadata: {
      accountId: item.accountId,
      status: item.status
    }
  };
}
