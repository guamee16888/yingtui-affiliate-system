import { AppApiError } from "./response.mjs";

export function assertAuthenticated(context) {
  if (!context?.userId) throw new AppApiError("UNAUTHENTICATED", "请先登录。", 401);
}

export function assertManagerRole(context) {
  assertAuthenticated(context);
  if (!["manager", "admin"].includes(context.role)) {
    throw new AppApiError("FORBIDDEN", "当前用户没有管理端权限。", 403);
  }
}

export function assertWorkspaceAccess(context, workspaceId) {
  assertAuthenticated(context);
  const requested = String(workspaceId || "").trim();
  if (!requested) throw new AppApiError("WORKSPACE_REQUIRED", "当前用户没有绑定 workspace。", 403);
  if (context.role === "admin" || context.workspaceIds?.includes(requested)) return requested;
  throw new AppApiError("WORKSPACE_FORBIDDEN", "不能访问其他 workspace。", 403);
}

export function taskWorkspaceId(task) {
  return task?.workspaceId || "workspace_default";
}

export function appendNote(current, note) {
  const value = String(note || "").trim();
  if (!value) return current || "";
  return current ? `${current}\n${value}` : value;
}

export function isFeedbackDebtTask(task) {
  return ["posted", "feedback_due"].includes(task?.status) || Boolean(task?.postedUrl);
}

export function missingMetrics(metrics = {}) {
  return ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]
    .filter((key) => Number(metrics?.[key] ?? 0) <= 0);
}
