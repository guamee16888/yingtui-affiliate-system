import { calculateAccountHealth } from "../account-health-engine.mjs";
import { CORE_COLLECTIONS, loadCollection, loadContentRules, saveCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { createStableId } from "../ids.mjs";
import { calculateEngagement, normalizeMetrics } from "../scoring.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { appendNote, finiteNumber, upsertCollection, upsertItem } from "./internal.mjs";

export async function saveDesktopFeedback(input = {}, actor = { userId: "user_owner" }) {
  const taskId = String(input.taskId || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const feedback = await readJson("data/feedback.json", { version: 1, updatedAt: "", entries: [] });
  const task = tasks.items.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  for (const [key, value] of Object.entries(input.metrics || {})) {
    if (Number(value) < 0) throw new Error(`${key} must be a non-negative number`);
  }
  const metrics = normalizeMetrics(input.metrics || {});
  const engagement = calculateEngagement(metrics);
  const now = new Date().toISOString();
  const entry = {
    id: input.feedbackId || createStableId("feedback", [task.workspaceId || "workspace_default", taskId]),
    workspaceId: task.workspaceId || "workspace_default",
    taskId,
    accountId: task.accountId || "",
    toolId: task.toolId || "",
    copyId: task.copyId || "",
    copyText: task.copyText || "",
    posted: true,
    postedUrl: task.postedUrl || "",
    postedAt: task.postedAt || "",
    metrics,
    notes: input.notes || "",
    engagementScore: engagement.engagementScore,
    engagementRate: finiteNumber(engagement.engagementRate),
    clickRate: finiteNumber(engagement.clickRate),
    saveRate: finiteNumber(engagement.saveRate),
    replyRate: finiteNumber(engagement.replyRate),
    createdAt: feedback.entries?.find((item) => item.id === input.feedbackId)?.createdAt || now,
    updatedAt: now
  };
  const nextTask = {
    ...task,
    status: "feedback_done",
    metrics,
    feedbackSavedAt: now,
    updatedAt: now,
    notes: appendNote(task.notes, input.notes ? `Feedback: ${input.notes}` : "")
  };
  await Promise.all([
    writeJsonAtomic("data/feedback.json", {
      ...feedback,
      updatedAt: now,
      entries: upsertItem(feedback.entries || [], entry, "id")
    }),
    saveCollection(CORE_COLLECTIONS.postTasks, { ...tasks, items: tasks.items.map((item) => item.taskId === taskId ? nextTask : item) })
  ]);
  await updateDesktopAccountHealth(entry.workspaceId, entry.accountId);
  await appendDesktopAudit({
    type: "feedback.save",
    workspaceId: entry.workspaceId,
    actorUserId: actor.userId,
    targetId: entry.id,
    summary: "Desktop feedback saved.",
    metadata: { metricKeys: Object.keys(metrics) }
  });
  return { feedback: entry, task: nextTask };
}


async function updateDesktopAccountHealth(workspaceId, accountId) {
  if (!accountId) return null;
  const [accounts, tasks, ledger, feedback, accountHealth, contentRules] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    readJson("data/feedback.json", { entries: [] }),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) return null;
  const health = calculateAccountHealth({
    account,
    tasks: tasks.items.filter((task) => task.accountId === accountId && (task.workspaceId || "workspace_default") === workspaceId),
    ledger: ledger.items.filter((item) => item.accountId === accountId && (item.workspaceId || "workspace_default") === workspaceId),
    feedback: (feedback.entries || []).filter((item) => item.accountId === accountId && (item.workspaceId || "workspace_default") === workspaceId),
    contentRules
  });
  const now = new Date().toISOString();
  const item = {
    healthId: createStableId("health", [workspaceId, accountId]),
    workspaceId,
    accountId,
    ...health,
    updatedAt: now
  };
  await saveCollection(CORE_COLLECTIONS.accountHealth, upsertCollection(accountHealth, item, "healthId"));
  return item;
}
