import { calculateEngagement } from "../scoring.mjs";
import { AppApiError, requireValue } from "./response.mjs";
import { appendNote, assertManagerRole, assertWorkspaceAccess, isFeedbackDebtTask, missingMetrics, taskWorkspaceId } from "./workspace-scope.mjs";

const METRIC_KEYS = ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"];

export async function handleManagerGet({ pathname, url, context, storage, loadManagerSummaryFn }) {
  assertManagerRole(context);
  const workspaceId = assertWorkspaceAccess(context, context.workspaceId);

  if (pathname === "/api/app/v1/manager/summary") return appManagerSummary(context, loadManagerSummaryFn);
  if (pathname === "/api/app/v1/manager/tasks") return appManagerTasks({ context, url, loadManagerSummaryFn });
  if (pathname === "/api/app/v1/manager/accounts") {
    const summary = await appManagerSummary(context, loadManagerSummaryFn);
    return { accounts: summary.accounts ?? [] };
  }
  if (pathname === "/api/app/v1/manager/feedback-debt") {
    const tasks = await storage.listWorkspaceTasks(workspaceId);
    return { items: buildFeedbackDebt(tasks) };
  }

  return null;
}

export async function handleManagerPost({ pathname, body, context, storage }) {
  assertManagerRole(context);
  const workspaceId = assertWorkspaceAccess(context, context.workspaceId);

  if (pathname === "/api/app/v1/manager/tasks/approve") {
    return approveTask({ body, context, storage, workspaceId });
  }
  if (pathname === "/api/app/v1/manager/tasks/reject") {
    return rejectTask({ body, context, storage, workspaceId });
  }
  if (pathname === "/api/app/v1/manager/feedback") {
    return saveFeedback({ body, context, storage, workspaceId });
  }

  return null;
}

async function appManagerSummary(context, loadManagerSummaryFn) {
  if (typeof loadManagerSummaryFn !== "function") {
    throw new AppApiError("APP_MANAGER_SUMMARY_MISSING", "Manager summary storage is not configured.", 500);
  }
  return loadManagerSummaryFn({
    workspaceId: context.workspaceId,
    managerUserId: context.userId
  });
}

async function appManagerTasks({ context, url, loadManagerSummaryFn }) {
  const summary = await appManagerSummary(context, loadManagerSummaryFn);
  const status = String(url.searchParams.get("status") || "").trim();
  const approvalStatus = String(url.searchParams.get("approvalStatus") || "").trim();
  const date = String(url.searchParams.get("date") || "").trim();
  const limit = clampLimit(url.searchParams.get("limit"));
  const tasks = (summary.tasks ?? [])
    .filter((task) => !status || task.status === status)
    .filter((task) => !approvalStatus || task.approvalStatus === approvalStatus)
    .filter((task) => !date || task.date === date)
    .slice(0, limit)
    .map(appTaskView);
  return { tasks };
}

async function approveTask({ body, context, storage, workspaceId }) {
  const taskId = String(requireValue(body?.taskId, "TASK_ID_REQUIRED", "taskId 必填。")).trim();
  const current = await findWorkspaceTask(storage, workspaceId, taskId);
  if (current.approvalStatus === "rejected") {
    throw new AppApiError("TASK_REJECTED", "已拒绝任务不能直接批准。", 409);
  }
  const updated = await storage.updateTaskStatus(workspaceId, taskId, {
    status: current.accountId && current.assignedTo ? "approved" : "pending_review",
    approvalStatus: "approved",
    managerUserId: context.userId,
    approvedBy: context.userId,
    approvedAt: new Date().toISOString()
  }, context);
  await storage.writeAuditLog(auditEvent(context, "task.approve", "post_task", taskId, {
    previousStatus: current.status,
    nextStatus: updated.status
  }));
  return { task: appTaskView(updated) };
}

async function rejectTask({ body, context, storage, workspaceId }) {
  const taskId = String(requireValue(body?.taskId, "TASK_ID_REQUIRED", "taskId 必填。")).trim();
  const reason = String(requireValue(body?.reason, "REJECT_REASON_REQUIRED", "拒绝原因必填。")).trim();
  const current = await findWorkspaceTask(storage, workspaceId, taskId);
  const updated = await storage.updateTaskStatus(workspaceId, taskId, {
    status: "skipped",
    approvalStatus: "rejected",
    managerUserId: context.userId,
    rejectedBy: context.userId,
    rejectedAt: new Date().toISOString(),
    notes: appendNote(current.notes, reason)
  }, context);
  await storage.writeAuditLog(auditEvent(context, "task.reject", "post_task", taskId, { reason }));
  return { task: appTaskView(updated) };
}

async function saveFeedback({ body, context, storage, workspaceId }) {
  const taskId = String(requireValue(body?.taskId, "TASK_ID_REQUIRED", "taskId 必填。")).trim();
  const task = await findWorkspaceTask(storage, workspaceId, taskId);
  const metrics = normalizeMetrics(body?.metrics ?? {});
  const engagement = calculateEngagement(metrics);
  const feedback = await storage.upsertFeedback(workspaceId, {
    feedbackId: createStableId("feedback", [workspaceId, taskId]),
    taskId,
    accountId: task.accountId || "",
    toolId: task.toolId || "",
    copyId: task.copyId || "",
    metrics,
    notes: String(body?.notes || "").trim(),
    engagementScore: engagement.engagementScore,
    engagementRate: safeRate(engagement.engagementRate),
    clickRate: safeRate(engagement.clickRate),
    saveRate: safeRate(engagement.saveRate),
    replyRate: safeRate(engagement.replyRate)
  }, context);
  const updated = await storage.updateTaskStatus(workspaceId, taskId, {
    metrics,
    status: task.status === "posted" ? "feedback_due" : task.status,
    notes: appendNote(task.notes, body?.notes ? `Feedback: ${body.notes}` : "")
  }, context);
  await storage.writeAuditLog(auditEvent(context, "feedback.upsert", "feedback", feedback.feedbackId || feedback.id, {
    taskId,
    metricKeys: Object.keys(metrics)
  }));
  return { feedback, task: appTaskView(updated) };
}

async function findWorkspaceTask(storage, workspaceId, taskId) {
  const tasks = await storage.listWorkspaceTasks(workspaceId);
  const task = tasks.find((item) => item.taskId === taskId);
  if (!task) throw new AppApiError("TASK_NOT_FOUND", "任务不存在，或不属于当前 workspace。", 404);
  if (taskWorkspaceId(task) !== workspaceId) throw new AppApiError("WORKSPACE_FORBIDDEN", "不能操作其他 workspace 的任务。", 403);
  return task;
}

function buildFeedbackDebt(tasks = []) {
  const now = Date.now();
  return tasks
    .filter(isFeedbackDebtTask)
    .filter((task) => missingMetrics(task.metrics).length)
    .map((task) => {
      const dueAt = task.feedbackDueAt || task.postedAt || task.updatedAt || task.createdAt || "";
      const dueTime = new Date(dueAt).getTime();
      const daysOverdue = Number.isFinite(dueTime) ? Math.max(0, Math.floor((now - dueTime) / 86400000)) : 0;
      return {
        taskId: task.taskId,
        accountId: task.accountId || "",
        account: task.accountName || task.accountId || "",
        assignedTo: task.assignedTo || "",
        postedUrl: task.postedUrl || "",
        postedAt: task.postedAt || "",
        missingMetrics: missingMetrics(task.metrics),
        daysOverdue
      };
    });
}

function normalizeMetrics(input) {
  const metrics = {};
  for (const key of METRIC_KEYS) {
    const value = Number(input[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) {
      throw new AppApiError("INVALID_METRIC", "反馈数据必须是非负数字。", 400);
    }
    metrics[key] = value;
  }
  return metrics;
}

function safeRate(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function appTaskView(task) {
  return {
    taskId: task.taskId,
    date: task.date || "",
    workspaceId: taskWorkspaceId(task),
    accountId: task.accountId || "",
    assignedTo: task.assignedTo || "",
    managerUserId: task.managerUserId || "",
    toolId: task.toolId || "",
    toolName: task.toolName || task.toolId || "Untitled task",
    toolUrl: task.toolUrl || "",
    topicId: task.topicId || "",
    copyId: task.copyId || "",
    variantType: task.variantType || "shortPost",
    copyText: task.copyText || "",
    weightedCharCount: Number(task.weightedCharCount ?? task.tweetLength?.weightedCharCount ?? 0),
    approvalStatus: task.approvalStatus || "pending",
    status: task.status || "draft",
    riskFlags: task.riskFlags ?? [],
    duplicateCheckResult: task.duplicateCheckResult ?? {},
    postedUrl: task.postedUrl || "",
    postedAt: task.postedAt || "",
    feedbackDueAt: task.feedbackDueAt || "",
    metrics: task.metrics ?? {},
    notes: task.notes || ""
  };
}

function auditEvent(context, action, entityType, entityId, metadata = {}) {
  return {
    workspaceId: context.workspaceId,
    actorUserId: context.userId,
    actorEmail: context.email,
    actorRole: context.role,
    action,
    entityType,
    entityId,
    metadata,
    createdAt: new Date().toISOString()
  };
}

function createStableId(prefix, parts) {
  let hash = 2166136261;
  const raw = parts.map((part) => String(part ?? "")).join("::");
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clampLimit(value) {
  const limit = Number(value || 100);
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(200, Math.floor(limit)));
}
