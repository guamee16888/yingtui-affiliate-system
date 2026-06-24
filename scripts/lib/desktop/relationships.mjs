import { emptyCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { createStableId } from "../ids.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { existingById, normalizeHandle, parseHandles, upsertItem } from "./internal.mjs";

export async function loadDesktopRelationshipTargets(input = {}) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  return {
    items: (current.items || [])
      .filter((target) => (target.workspaceId || "workspace_default") === workspaceId)
      .filter((target) => !accountId || target.accountId === accountId)
  };
}

export async function addDesktopRelationshipTargets(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const handles = parseHandles(input.targetHandle || input.handles || input.text || "");
  if (!handles.length) throw new Error("请输入目标 handle。");
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  const now = new Date().toISOString();
  let items = current.items || [];
  const saved = [];
  for (const handle of handles) {
    const item = {
      targetId: createStableId("target", [workspaceId, accountId, handle]),
      workspaceId,
      accountId,
      targetHandle: normalizeHandle(handle),
      category: input.category || "watch",
      reason: input.reason || "",
      status: input.status || "suggested",
      notes: input.notes || "",
      createdAt: existingById(items, "targetId", createStableId("target", [workspaceId, accountId, handle]))?.createdAt || now,
      updatedAt: now
    };
    items = upsertItem(items, item, "targetId");
    saved.push(item);
  }
  await writeJsonAtomic("data/relationship-targets.json", { ...current, updatedAt: now, items });
  await appendDesktopAudit({
    type: "relationship_target.add",
    workspaceId,
    actorUserId: actor.userId,
    targetId: accountId,
    summary: `Added ${saved.length} relationship target(s).`
  });
  return { items: saved };
}

export async function updateDesktopRelationshipTargetStatus(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const targetId = String(input.targetId || "").trim();
  const status = String(input.status || "").trim();
  if (!accountId) throw new Error("accountId is required");
  if (!targetId) throw new Error("targetId is required");
  if (!["suggested", "opened", "followed_manually", "ignored", "watch"].includes(status)) {
    throw new Error("Unsupported target status.");
  }
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  const now = new Date().toISOString();
  let found = null;
  const items = (current.items || []).map((target) => {
    if ((target.workspaceId || "workspace_default") !== workspaceId || target.accountId !== accountId || target.targetId !== targetId) {
      return target;
    }
    found = { ...target, status, updatedAt: now };
    return found;
  });
  if (!found) throw new Error(`目标关系不存在：${targetId}`);
  await writeJsonAtomic("data/relationship-targets.json", { ...current, updatedAt: now, items });
  await appendDesktopAudit({
    type: status === "followed_manually" ? "relationship_target.followed_manually" : "relationship_target.status",
    workspaceId,
    actorUserId: actor.userId,
    targetId,
    summary: `Relationship target marked as ${status}.`,
    metadata: { accountId, status }
  });
  return { item: found };
}

export async function recordDesktopWindowOpen(input = {}, actor = { userId: "user_owner" }) {
  const windowMode = input.windowMode === "persistent" ? "persistent" : "temp";
  await appendDesktopAudit({
    type: windowMode === "persistent" ? "desktop.window.open_persistent" : "desktop.window.open_incognito",
    workspaceId: input.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: input.accountId || "",
    summary: windowMode === "persistent" ? "Persistent account window opened." : "Temporary account window opened.",
    metadata: {
      accountId: input.accountId || "",
      handle: input.handle || "",
      url: input.url || "",
      windowMode
    }
  });
  return { ok: true };
}
