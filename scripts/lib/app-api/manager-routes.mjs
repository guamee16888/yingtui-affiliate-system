import { calculateEngagement } from "../scoring.mjs";
import {
  listRelationshipTargets,
  upsertRelationshipTarget,
  updateRelationshipTargetStatus
} from "../relationship-targets.mjs";
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
  const targetsRoute = parseTargetsRoute(pathname);
  if (targetsRoute?.action === "list") {
    assertAccountAvailable(context, targetsRoute.accountId, await appManagerSummary(context, loadManagerSummaryFn));
    return { items: await listTargets({ storage, workspaceId, accountId: targetsRoute.accountId }) };
  }

  return null;
}

export function handleManagerPost({ pathname, body, context, storage, loadManagerSummaryFn }) {
  assertManagerRole(context);
  const workspaceId = assertWorkspaceAccess(context, context.workspaceId);

  if (pathname === "/api/app/v1/manager/tasks/assign") {
    return assignTask({ body, context, storage, workspaceId, loadManagerSummaryFn });
  }
  if (pathname === "/api/app/v1/manager/tasks/approve") {
    return approveTask({ body, context, storage, workspaceId, loadManagerSummaryFn });
  }
  if (pathname === "/api/app/v1/manager/tasks/reject") {
    return rejectTask({ body, context, storage, workspaceId });
  }
  if (pathname === "/api/app/v1/manager/tasks/batch") {
    return batchTasks({ body, context, storage, workspaceId, loadManagerSummaryFn });
  }
  if (pathname === "/api/app/v1/manager/feedback") {
    return saveFeedback({ body, context, storage, workspaceId });
  }
  const targetsRoute = parseTargetsRoute(pathname);
  if (targetsRoute?.action === "upsert") {
    return upsertTarget({ body, context, storage, workspaceId, accountId: targetsRoute.accountId, loadManagerSummaryFn });
  }
  if (targetsRoute?.action === "status") {
    return updateTargetStatus({ body, context, storage, workspaceId, accountId: targetsRoute.accountId, loadManagerSummaryFn });
  }

  return null;
}

function appManagerSummary(context, loadManagerSummaryFn) {
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

async function assignTask({ body, context, storage, workspaceId, loadManagerSummaryFn }) {
  const taskId = String(requireValue(body?.taskId, "TASK_ID_REQUIRED", "taskId 必填。")).trim();
  const current = await findWorkspaceTask(storage, workspaceId, taskId);
  assertTaskMutable(current);
  const assignment = await assignmentPatch({ body, current, context, loadManagerSummaryFn });
  const complete = assignment.effective.accountId && assignment.effective.assignedTo;
  const updated = await storage.updateTaskStatus(workspaceId, taskId, {
    ...assignment.patch,
    managerUserId: context.userId,
    status: current.approvalStatus === "approved" && complete ? "assigned" : current.status
  }, context);
  await storage.writeAuditLog(auditEvent(context, "task.assign", "post_task", taskId, {
    accountId: updated.accountId || "",
    assignedTo: updated.assignedTo || ""
  }));
  return { task: appTaskView(updated) };
}

async function approveTask({ body, context, storage, workspaceId, loadManagerSummaryFn }) {
  const taskId = String(requireValue(body?.taskId, "TASK_ID_REQUIRED", "taskId 必填。")).trim();
  const current = await findWorkspaceTask(storage, workspaceId, taskId);
  assertTaskMutable(current);
  if (current.approvalStatus === "rejected") {
    throw new AppApiError("TASK_REJECTED", "已拒绝任务不能直接批准。", 409);
  }
  const assignment = await assignmentPatch({ body, current, context, loadManagerSummaryFn });
  if (!assignment.effective.accountId || !assignment.effective.assignedTo) {
    throw new AppApiError("TASK_NOT_ASSIGNED", "批准前必须先分配账号和员工。", 409);
  }
  const updated = await storage.updateTaskStatus(workspaceId, taskId, {
    ...assignment.patch,
    status: "assigned",
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
  assertTaskMutable(current);
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

async function batchTasks({ body, context, storage, workspaceId, loadManagerSummaryFn }) {
  const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!taskIds.length) throw new AppApiError("TASK_IDS_REQUIRED", "请先选择任务。", 400);
  const action = String(requireValue(body?.action, "ACTION_REQUIRED", "action 必填。")).trim();
  if (!["assign", "approve", "reject"].includes(action)) {
    throw new AppApiError("ACTION_INVALID", "action 只能是 assign、approve 或 reject。", 400);
  }
  const items = [];
  const failed = [];
  for (const taskId of taskIds) {
    try {
      const payload = { ...body, taskId };
      const result = action === "assign"
        ? await assignTask({ body: payload, context, storage, workspaceId, loadManagerSummaryFn })
        : action === "approve"
          ? await approveTask({ body: payload, context, storage, workspaceId, loadManagerSummaryFn })
          : await rejectTask({ body: payload, context, storage, workspaceId });
      items.push(result.task);
    } catch (error) {
      failed.push({ taskId, code: error.code || "TASK_FAILED", error: error.message || "操作失败" });
    }
  }
  await storage.writeAuditLog(auditEvent(context, `task.batch.${action}`, "post_task", taskIds.join(","), {
    total: taskIds.length,
    succeeded: items.length,
    failed: failed.length
  }));
  return { items, failed };
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

async function upsertTarget({ body, context, storage, workspaceId, accountId, loadManagerSummaryFn }) {
  assertAccountAvailable(context, accountId, await appManagerSummary(context, loadManagerSummaryFn));
  const result = typeof storage.upsertRelationshipTarget === "function"
    ? await storage.upsertRelationshipTarget(workspaceId, accountId, body, context)
    : await upsertRelationshipTarget({ workspaceId, accountId, input: body, actor: context });
  await storage.writeAuditLog(result.audit || auditEvent(context, "relationship_target.upsert", "relationship_target", result.item?.targetId || body?.targetId || "", {
    accountId,
    targetHandle: result.item?.targetHandle || body?.targetHandle || ""
  }));
  return { item: result.item };
}

async function updateTargetStatus({ body, context, storage, workspaceId, accountId, loadManagerSummaryFn }) {
  if (Array.isArray(body?.targetIds)) {
    throw new AppApiError("TARGET_BATCH_FORBIDDEN", "目标关系状态必须单账号、单目标、人工确认更新。", 403);
  }
  assertAccountAvailable(context, accountId, await appManagerSummary(context, loadManagerSummaryFn));
  const targetId = String(requireValue(body?.targetId, "TARGET_ID_REQUIRED", "targetId 必填。")).trim();
  const status = String(requireValue(body?.status, "TARGET_STATUS_REQUIRED", "status 必填。")).trim();
  const notes = String(body?.notes || "");
  const result = typeof storage.updateRelationshipTargetStatus === "function"
    ? await storage.updateRelationshipTargetStatus(workspaceId, accountId, targetId, status, notes, context)
    : await updateRelationshipTargetStatus({ workspaceId, accountId, targetId, status, notes, actor: context });
  await storage.writeAuditLog(result.audit || auditEvent(context, "relationship_target.status", "relationship_target", targetId, {
    accountId,
    status
  }));
  return { item: result.item };
}

function listTargets({ storage, workspaceId, accountId }) {
  if (typeof storage.listRelationshipTargets === "function") {
    return storage.listRelationshipTargets(workspaceId, accountId);
  }
  return listRelationshipTargets({ workspaceId, accountId });
}

function assertAccountAvailable(context, accountId, summary) {
  if (!summary.accounts?.some((account) => account.accountId === accountId)) {
    throw new AppApiError("ACCOUNT_NOT_AVAILABLE", "账号不属于当前 workspace。", 404);
  }
  assertWorkspaceAccess(context, context.workspaceId);
}

function parseTargetsRoute(pathname) {
  const match = pathname.match(/^\/api\/app\/v1\/manager\/accounts\/([^/]+)\/targets(?:\/(upsert|status))?$/);
  if (!match) return null;
  return {
    accountId: decodeURIComponent(match[1]),
    action: match[2] || "list"
  };
}

async function assignmentPatch({ body, current, context, loadManagerSummaryFn }) {
  const hasAccount = Object.hasOwn(body ?? {}, "accountId");
  const hasStaff = Object.hasOwn(body ?? {}, "assignedTo");
  const accountId = hasAccount ? String(body.accountId || "").trim() : current.accountId || "";
  const assignedTo = hasStaff ? String(body.assignedTo || "").trim() : current.assignedTo || "";
  const patch = {};
  if (hasAccount) patch.accountId = accountId;
  if (hasStaff) patch.assignedTo = assignedTo;
  if (hasAccount || hasStaff) {
    await assertAssignmentAllowed({ accountId, assignedTo, context, loadManagerSummaryFn });
  }
  return { patch, effective: { accountId, assignedTo } };
}

async function assertAssignmentAllowed({ accountId, assignedTo, context, loadManagerSummaryFn }) {
  if (typeof loadManagerSummaryFn !== "function") return;
  const summary = await loadManagerSummaryFn({
    workspaceId: context.workspaceId,
    managerUserId: context.userId
  });
  if (accountId && !(summary.accounts || []).some((account) => account.accountId === accountId)) {
    throw new AppApiError("ACCOUNT_NOT_AVAILABLE", "账号不属于当前 workspace，不能分配。", 400);
  }
  if (assignedTo && !(summary.staff || []).some((user) => user.userId === assignedTo)) {
    throw new AppApiError("STAFF_NOT_AVAILABLE", "员工不属于当前 workspace，不能分配。", 400);
  }
}

function assertTaskMutable(task) {
  if (["copied", "feedback_due", "posted", "skipped"].includes(task.status)) {
    throw new AppApiError("TASK_LOCKED", "这个任务已经进入执行或关闭状态，不能继续审核。", 409);
  }
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
